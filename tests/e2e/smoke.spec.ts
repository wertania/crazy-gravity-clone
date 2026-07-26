import { expect, test, type Page } from '@playwright/test';

/**
 * Browser-level checks: the things unit tests structurally cannot see - that
 * WebGL initialises, that the menus navigate, that keyboard flight actually
 * moves the ship, and that nothing logs an error while doing it.
 */

async function bootWithoutSave(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Playwright gives each test a fresh context, so localStorage already starts
  // empty. Clearing it in an init script would also wipe it on every reload,
  // which is exactly what the persistence test needs to survive.
  await page.goto('/');
  await expect(page.locator('.panel h1')).toHaveText('GRAVITY HAULER');
  return errors;
}

/**
 * A menu row by its label. Rows now carry an explanation underneath, so plain
 * text matching is ambiguous - "Steuerung" also appears inside two
 * descriptions. The accessible name starts with the label, so anchor on that.
 */
function row(page: Page, label: string | RegExp) {
  const re = typeof label === 'string' ? new RegExp('^' + label) : label;
  return page.getByRole('option', { name: re });
}

/** Read simulation state straight out of the running game instance. */
async function shipState(page: Page) {
  return page.evaluate(() => {
    const w = (window as never as { game: { world: unknown } }).game as unknown as {
      world: {
        ship: {
          pos: { x: number; y: number };
          angle: number;
          fuel: number;
          state: string;
          throttle: number;
        };
        time: number;
        status: string;
        level: { spec: { id: number; name: string } };
      };
    };
    const s = w.world;
    return {
      x: s.ship.pos.x,
      y: s.ship.pos.y,
      angle: s.ship.angle,
      fuel: s.ship.fuel,
      shipState: s.ship.state,
      throttle: s.ship.throttle,
      time: s.time,
      status: s.status,
      levelId: s.level.spec.id,
      levelName: s.level.spec.name,
    };
  });
}

test('boots into the title screen with a live WebGL canvas', async ({ page }) => {
  const errors = await bootWithoutSave(page);

  const canvasOk = await page.evaluate(() => {
    const c = document.getElementById('stage') as HTMLCanvasElement;
    return c.width > 0 && c.height > 0;
  });
  expect(canvasOk).toBe(true);

  // A rendered frame must not be uniformly black.
  await page.waitForTimeout(900);
  const shot = await page.locator('#stage').screenshot();
  expect(shot.byteLength).toBeGreaterThan(2000);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('title menu reaches the how-to-fly screen and back', async ({ page }) => {
  await bootWithoutSave(page);
  await row(page, 'Steuerung').click();
  await expect(page.locator('.panel h2')).toHaveText('STEUERUNG');
  await row(page, 'Zurück').click();
  await expect(page.locator('.panel h1')).toHaveText('GRAVITY HAULER');
});

test('launching shows the briefing, then the HUD, and the ship flies', async ({ page }) => {
  const errors = await bootWithoutSave(page);

  await row(page, 'Starten').click();
  await expect(page.locator('.badge')).toHaveText('HÖHLE 01 VON 20');
  await expect(page.locator('.panel h2')).toHaveText('ERSTES LICHT');

  await row(page, 'Losfliegen').click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#h-levelname')).toHaveText('ERSTES LICHT');

  const before = await shipState(page);
  expect(before.shipState).toBe('flying');

  // Hold thrust with the nose up: the ship must climb and burn fuel.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  const afterThrust = await shipState(page);
  expect(afterThrust.y).toBeGreaterThan(before.y);
  expect(afterThrust.fuel).toBeLessThan(before.fuel);

  // Rotating must change the heading. Software rendering can drop to a handful
  // of frames a second here, so assert direction and a small floor, not a rate.
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyA');
  const afterTurn = await shipState(page);
  expect(afterTurn.angle - afterThrust.angle).toBeGreaterThan(0.15);

  // Gravity must pull it back down once the engine is off.
  const peak = afterTurn.y;
  await page.waitForTimeout(900);
  const falling = await shipState(page);
  expect(falling.y).toBeLessThan(peak);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('pause freezes the simulation and resumes it', async ({ page }) => {
  await bootWithoutSave(page);
  await row(page, 'Starten').click();
  await row(page, 'Losfliegen').click();
  await expect(page.locator('#hud')).toBeVisible();

  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel h2')).toHaveText('PAUSE');

  const frozen = await shipState(page);
  await page.waitForTimeout(600);
  const stillFrozen = await shipState(page);
  expect(stillFrozen.time).toBeCloseTo(frozen.time, 5);
  expect(stillFrozen.y).toBeCloseTo(frozen.y, 5);

  await page.keyboard.press('Escape');
  await expect(page.locator('#hud')).toBeVisible();
  // Generous: a single software-rendered frame can exceed 300 ms here, and the
  // pace multiplier means one frame is less than one simulated frame's worth.
  await page.waitForTimeout(1200);
  const running = await shipState(page);
  expect(running.time).toBeGreaterThan(frozen.time);
});

test('restart returns the ship to the spawn point', async ({ page }) => {
  await bootWithoutSave(page);
  await row(page, 'Starten').click();
  await row(page, 'Losfliegen').click();
  await expect(page.locator('#hud')).toBeVisible();

  await page.keyboard.down('KeyD');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyD');
  const moved = await shipState(page);

  await page.keyboard.press('KeyR');
  await page.waitForTimeout(200);
  const reset = await shipState(page);
  expect(reset.time).toBeLessThan(moved.time);
  expect(reset.fuel).toBeGreaterThan(moved.fuel);
});

test('a valid password unlocks its cave', async ({ page }) => {
  await bootWithoutSave(page);
  await row(page, 'Passwort eingeben').click();
  await expect(page.locator('.panel h2')).toHaveText('PASSWORT');

  await page.locator('#pw').fill('nonsense');
  await page.locator('#pw').press('Enter');
  await expect(page.locator('.footnote')).toHaveText('Kein gültiges Passwort.');

  await page.locator('#pw').fill('meander');
  await page.locator('#pw').press('Enter');
  await expect(page.locator('.panel h2')).toHaveText('MÄANDER');
  await expect(page.locator('.badge')).toHaveText('HÖHLE 16 VON 20');
});

test('progress survives a reload', async ({ page }) => {
  await bootWithoutSave(page);
  await row(page, 'Passwort eingeben').click();
  await page.locator('#pw').fill('crucible');
  await page.locator('#pw').press('Enter');
  await expect(page.locator('.badge')).toHaveText('HÖHLE 10 VON 20');

  await page.reload();
  await expect(page.locator('.panel h1')).toHaveText('GRAVITY HAULER');
  await expect(row(page, 'Weiterfliegen')).toContainText('Schmelztiegel');
});

test('keeps the simulation at real time on the largest level', async ({ page }) => {
  await bootWithoutSave(page);
  await row(page, 'Passwort eingeben').click();
  await page.locator('#pw').fill('eventide');
  await page.locator('#pw').press('Enter');
  await row(page, 'Losfliegen').click();
  await expect(page.locator('#hud')).toBeVisible();

  await page.keyboard.press('F3');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2000);
  await page.keyboard.up('KeyW');

  // Let the adaptive quality system settle on a tier first.
  await page.waitForTimeout(3000);

  // The property that actually matters is not a frame count - this runs on
  // SwiftShader, a pure software rasteriser roughly two orders of magnitude
  // slower than a real GPU. It is that simulated time keeps pace with wall
  // time no matter how slow rendering is, which is exactly what the loop's
  // catch-up budget guarantees and what a too-small step cap silently broke.
  const t0 = await simTime(page);
  const wall0 = Date.now();
  await page.waitForTimeout(2500);
  const elapsedWall = (Date.now() - wall0) / 1000;
  const elapsedSim = (await simTime(page)) - t0;

  // Compared against the configured pace, which defaults below 1. Below roughly
  // 4 fps the loop's frame-time clamp - the spiral-of-death guard - deliberately
  // lets simulated time fall behind rather than trying to catch up forever, and
  // SwiftShader sits right around there. So the bar is "does not stall, and
  // never runs fast", not exact parity. On real hardware this is not in play.
  const scale = await page.evaluate(
    () => (window as never as { game: { loop: { timeScale: number } } }).game.loop.timeScale,
  );
  // 0.45 rather than something tighter: on the largest level SwiftShader sits
  // right at the frame-time clamp, where every dropped millisecond is lost
  // simulated time by design. A genuine stall would read ~0, and running fast
  // is caught by the upper bound - those are the failures worth catching here.
  expect(elapsedSim).toBeGreaterThan(elapsedWall * scale * 0.45);
  expect(elapsedSim).toBeLessThan(elapsedWall * scale * 1.05);

  // And the renderer must still be producing frames, not wedged.
  const frames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const t = performance.now();
        const tick = () => {
          n++;
          if (performance.now() - t < 1000) requestAnimationFrame(tick);
          else resolve(n);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(frames).toBeGreaterThan(3);

  // The quality system must have noticed and stepped down from the top tier.
  const quality = await page.evaluate(
    () => (window as never as { game: { stage: { qualityLevel: number } } }).game.stage.qualityLevel,
  );
  expect(quality).toBeLessThan(2);
});

/** Read the on-screen controls' own state, independent of the simulation. */
async function touchState(page: Page): Promise<{ turn: number; throttle: number }> {
  return page.evaluate(() =>
    (
      window as never as {
        game: { touch: { state(): { turn: number; throttle: number } } };
      }
    ).game.touch.state(),
  );
}

async function simTime(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as never as { game: { world: { time: number } } }).game.world.time,
  );
}

// ---------------------------------------------------------------------------
// On-screen controls and pace
// ---------------------------------------------------------------------------

/** Force the sliders on regardless of what the test browser reports. */
async function enableTouchControls(page: Page) {
  await row(page, 'Einstellungen').click();
  await expect(page.locator('.panel h2')).toHaveText('EINSTELLUNGEN');
  await row(page, 'Bildschirmsteuerung').click();
  await expect(row(page, 'Bildschirmsteuerung')).toContainText('Immer an');
  await row(page, 'Zurück').click();
}

async function launchLevelOne(page: Page) {
  await row(page, 'Starten').click();
  await row(page, 'Losfliegen').click();
  await expect(page.locator('#hud')).toBeVisible();
}

/**
 * Press at a point given in 0..1 of an element's box, then drag by a pixel
 * offset. The paddles are relative: what matters is the movement, not where it
 * started.
 */
async function pressAndDrag(
  page: Page,
  selector: string,
  from: { x: number; y: number },
  by: { dx: number; dy: number },
) {
  const box = (await page.locator(selector).boundingBox())!;
  const sx = box.x + box.width * from.x;
  const sy = box.y + box.height * from.y;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + by.dx, sy + by.dy, { steps: 8 });
}

/** The drag distance that spans a paddle's full range: the drawn track length. */
async function trackTravel(page: Page, selector: string, axis: 'x' | 'y') {
  const box = (await page.locator(selector).boundingBox())!;
  return axis === 'x' ? box.width / 2 : box.height;
}

test('the throttle paddle is analog and springs back', async ({ page }) => {
  const errors = await bootWithoutSave(page);
  await enableTouchControls(page);
  await launchLevelOne(page);
  await expect(page.locator('.touch')).toBeVisible();

  const travel = await trackTravel(page, '.touch-vtrack', 'y');

  // Half a track's worth of upward drag is half power, not "on".
  await pressAndDrag(page, '.touch-vtrack', { x: 0.5, y: 0.5 }, { dx: 0, dy: -travel / 2 });
  await page.waitForTimeout(250);
  const half = (await touchState(page)).throttle;
  expect(half).toBeGreaterThan(0.35);
  expect(half).toBeLessThan(0.65);
  await page.mouse.up();

  // Releasing must close the throttle, not leave the engine burning.
  await page.waitForTimeout(600);
  expect((await touchState(page)).throttle).toBe(0);

  // A full stroke: real power, the ship climbs, the tank drains.
  const before = await shipState(page);
  await pressAndDrag(page, '.touch-vtrack', { x: 0.5, y: 0.5 }, { dx: 0, dy: -travel });
  await page.waitForTimeout(600);
  const full = await shipState(page);
  await page.mouse.up();

  expect(full.throttle).toBeGreaterThan(0.9);
  expect(full.y).toBeGreaterThan(before.y);
  expect(full.fuel).toBeLessThan(before.fuel);

  expect(errors, errors.join('\n')).toEqual([]);
});

test('a thumb that lands beside the throttle track still works', async ({ page }) => {
  // The whole point of the rewrite. In the first version the hit area was the
  // drawn track, so pressing next to it and swiping up did nothing at all.
  await bootWithoutSave(page);
  await enableTouchControls(page);
  await launchLevelOne(page);

  const zone = (await page.locator('.touch-zone-right').boundingBox())!;
  const track = (await page.locator('.touch-vtrack').boundingBox())!;
  // Bottom-left corner of the zone: comfortably outside the drawn track.
  const px = zone.x + 12;
  const py = zone.y + zone.height - 12;
  expect(px).toBeLessThan(track.x);
  expect(py).toBeGreaterThan(track.y + track.height);

  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px, py - track.height, { steps: 8 });
  await page.waitForTimeout(400);
  const s = await shipState(page);
  await page.mouse.up();

  expect(s.throttle).toBeGreaterThan(0.9);
  expect(s.shipState).toBe('flying');
});

test('the steering paddle turns the ship and re-centres', async ({ page }) => {
  await bootWithoutSave(page);
  await enableTouchControls(page);
  await launchLevelOne(page);

  const travel = await trackTravel(page, '.touch-track', 'x');
  const before = await shipState(page);

  // Dragging right means clockwise, i.e. a decreasing angle.
  await pressAndDrag(page, '.touch-track', { x: 0.5, y: 0.5 }, { dx: travel, dy: 0 });
  await page.waitForTimeout(400);
  const turned = await shipState(page);
  expect(turned.angle).toBeLessThan(before.angle - 0.15);
  expect((await touchState(page)).turn).toBeLessThan(-0.9);

  // The spring-back is asserted on the widget, not on the ship: with no thrust
  // the hull is on its way to the floor and a respawn would swamp the reading.
  await page.mouse.up();
  await page.waitForTimeout(700);
  expect((await touchState(page)).turn).toBe(0);
});

test.describe('with a touchscreen', () => {
  test.use({ hasTouch: true });

  test('a touch in one zone does not steal the other paddle', async ({ page }) => {
    await bootWithoutSave(page);
    await enableTouchControls(page);
    await launchLevelOne(page);

    const steer = (await page.locator('.touch-track').boundingBox())!;
    const track = (await page.locator('.touch-vtrack').boundingBox())!;

    // Hold the throttle open with one pointer...
    await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2 - track.height, {
      steps: 8,
    });
    await page.waitForTimeout(300);
    expect((await touchState(page)).throttle).toBeGreaterThan(0.9);

    // ...and touch the steering zone with a second, independent one.
    await page.touchscreen.tap(steer.x + steer.width * 0.9, steer.y + steer.height / 2);
    await page.waitForTimeout(300);

    const after = await touchState(page);
    await page.mouse.up();
    expect(after.throttle).toBeGreaterThan(0.9);
  });
});

test('a fresh save starts on the easier defaults', async ({ page }) => {
  await bootWithoutSave(page);
  await expect(row(page, 'Schwierigkeit')).toContainText('Neuling');
  await expect(row(page, 'Einstellungen')).toContainText('Sanft');
});

test('the pace setting really slows simulated time down', async ({ page }) => {
  await bootWithoutSave(page);
  await launchLevelOne(page);

  // Pin the cheapest tier before measuring. Otherwise the adaptive quality
  // system steps down *between* the two samples, the frame cost changes under
  // the measurement, and the pace difference disappears into the frame-time
  // clamp - which is a property of the renderer, not of the pace setting.
  const pinFastest = () =>
    page.evaluate(() =>
      (
        window as never as { game: { stage: { lockQuality(l: number): void } } }
      ).game.stage.lockQuality(0),
    );

  const measure = async () => {
    await pinFastest();
    await page.waitForTimeout(400);
    const t0 = await simTime(page);
    const w0 = Date.now();
    await page.waitForTimeout(2000);
    const t1 = await simTime(page);
    return (t1 - t0) / ((Date.now() - w0) / 1000);
  };

  // Default is Gentle (85%).
  const gentle = await measure();

  await page.keyboard.press('Escape');
  await row(page, 'Lauf abbrechen').click();
  await row(page, 'Einstellungen').click();
  // Gentle -> Standard -> Brisk: two steps to the fastest tier.
  await row(page, 'Tempo').click();
  await row(page, 'Tempo').click();
  await expect(row(page, 'Tempo')).toContainText('Flott');
  await row(page, 'Zurück').click();
  await launchLevelOne(page);

  const brisk = await measure();

  // Relative comparison: absolute rates depend on the renderer, but Brisk
  // (115%) must clearly out-pace Gentle (85%) - nominally 1.35x.
  expect(brisk).toBeGreaterThan(gentle * 1.15);
});

// ---------------------------------------------------------------------------
// Ladebildschirm
// ---------------------------------------------------------------------------

test('shows a loading screen before the bundle has arrived', async ({ page }) => {
  // Hold the bundle open: the boot screen must carry the wait on its own, with
  // no help from the game code it is waiting for.
  await page.route('**/*.js', async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue();
  });
  page.goto('/', { waitUntil: 'commit' }).catch(() => {});

  await expect(page.locator('#boot')).toBeVisible();
  await expect(page.locator('#boot-status')).toHaveText(/Wird geladen/);
  // The game itself must not have rendered anything yet.
  await expect(page.locator('#overlay')).toBeHidden();

  const style = await page.locator('#boot').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { opacity: cs.opacity, display: cs.display, z: cs.zIndex };
  });
  expect(style).toEqual({ opacity: '1', display: 'flex', z: '100' });

  // Once the bundle lands the screen must hand over and remove itself.
  await expect(page.locator('.panel h1')).toHaveText('GRAVITY HAULER', { timeout: 30_000 });
  await expect(page.locator('#boot')).toHaveCount(0);
});

test('reports a failed download instead of hanging on black', async ({ page }) => {
  await page.route('**/*.js', (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' }).catch(() => {});

  await expect(page.locator('#boot-status')).toHaveText(/nicht geladen werden/);
  await expect(page.locator('#boot-status')).toHaveClass(/error/);
});

// ---------------------------------------------------------------------------
// Helligkeit
// ---------------------------------------------------------------------------

/**
 * Fraction of the frame that is essentially blown out to white.
 *
 * Screenshot the page, hand the PNG back to the browser, decode it onto a 2D
 * canvas and count near-white pixels. Roundabout, but it needs no image
 * library and it measures the thing that actually went wrong: the ship used to
 * sit inside a white ball big enough that you could not see the ship.
 */
async function blownOutFraction(page: Page): Promise<number> {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let blown = 0;
    for (let i = 0; i < d.length; i += 4) {
      const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      if (lum > 0.9) blown++;
    }
    return blown / (c.width * c.height);
  }, shot);
}

test('the ship never blows the screen out, even with bloom on', async ({ page }) => {
  await bootWithoutSave(page);
  await launchLevelOne(page);

  // The adaptive quality system switches bloom off on a software renderer, so
  // without pinning the tier this would test the wrong thing entirely - which
  // is exactly how the over-bright build shipped.
  await page.evaluate(() =>
    (
      window as never as { game: { stage: { lockQuality(l: number): void } } }
    ).game.stage.lockQuality(2),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as never as { game: { stage: { qualityLevel: number } } }).game.stage.qualityLevel,
      ),
    )
    .toBe(2);
  await page.waitForTimeout(500);

  // Idle, and under full thrust.
  expect(await blownOutFraction(page)).toBeLessThan(0.0012);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  expect(await blownOutFraction(page)).toBeLessThan(0.0012);
  await page.keyboard.up('KeyW');

  // And the brightest state the ship can reach: full flow, engine lit. The hull
  // is parked so it cannot fly into the ceiling mid-measurement.
  await page.evaluate(() => {
    const w = (window as never as { game: { world: Record<string, never> } }).game.world as unknown as {
      flow: number;
      ship: { pos: { x: number; y: number }; vel: { x: number; y: number } };
    };
    const hold = { x: w.ship.pos.x, y: w.ship.pos.y };
    const pin = () => {
      w.flow = 100;
      w.ship.pos.x = hold.x;
      w.ship.pos.y = hold.y;
      w.ship.vel.x = 0;
      w.ship.vel.y = 0;
      requestAnimationFrame(pin);
    };
    pin();
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  const worst = await blownOutFraction(page);
  await page.keyboard.up('KeyW');

  // Measured ~0.03% after the fix; the pre-fix build sat at ~0.28%, so this
  // bound has room for honest variation and still catches a real regression.
  expect(worst).toBeLessThan(0.0012);
});
