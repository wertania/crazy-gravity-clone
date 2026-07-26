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

/** Read simulation state straight out of the running game instance. */
async function shipState(page: Page) {
  return page.evaluate(() => {
    const w = (window as never as { game: { world: unknown } }).game as unknown as {
      world: {
        ship: { pos: { x: number; y: number }; angle: number; fuel: number; state: string };
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
  await page.getByText('How to fly').click();
  await expect(page.locator('.panel h2')).toHaveText('HOW TO FLY');
  await page.getByText('Back', { exact: true }).click();
  await expect(page.locator('.panel h1')).toHaveText('GRAVITY HAULER');
});

test('launching shows the briefing, then the HUD, and the ship flies', async ({ page }) => {
  const errors = await bootWithoutSave(page);

  await page.getByText('Launch', { exact: true }).click();
  await expect(page.locator('.badge')).toHaveText('CAVE 01 OF 20');
  await expect(page.locator('.panel h2')).toHaveText('FIRST LIGHT');

  await page.getByRole('option', { name: /Launch/ }).click();
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#h-levelname')).toHaveText('FIRST LIGHT');

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
  await page.getByText('Launch', { exact: true }).click();
  await page.getByRole('option', { name: /Launch/ }).click();
  await expect(page.locator('#hud')).toBeVisible();

  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(page.locator('.panel h2')).toHaveText('PAUSED');

  const frozen = await shipState(page);
  await page.waitForTimeout(600);
  const stillFrozen = await shipState(page);
  expect(stillFrozen.time).toBeCloseTo(frozen.time, 5);
  expect(stillFrozen.y).toBeCloseTo(frozen.y, 5);

  await page.keyboard.press('Escape');
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(400);
  const running = await shipState(page);
  expect(running.time).toBeGreaterThan(frozen.time);
});

test('restart returns the ship to the spawn point', async ({ page }) => {
  await bootWithoutSave(page);
  await page.getByText('Launch', { exact: true }).click();
  await page.getByRole('option', { name: /Launch/ }).click();
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
  await page.getByText('Enter password').click();
  await expect(page.locator('.panel h2')).toHaveText('PASSWORD');

  await page.locator('#pw').fill('nonsense');
  await page.locator('#pw').press('Enter');
  await expect(page.locator('.footnote')).toHaveText('Not a valid password.');

  await page.locator('#pw').fill('meander');
  await page.locator('#pw').press('Enter');
  await expect(page.locator('.panel h2')).toHaveText('MEANDER');
  await expect(page.locator('.badge')).toHaveText('CAVE 16 OF 20');
});

test('progress survives a reload', async ({ page }) => {
  await bootWithoutSave(page);
  await page.getByText('Enter password').click();
  await page.locator('#pw').fill('crucible');
  await page.locator('#pw').press('Enter');
  await expect(page.locator('.badge')).toHaveText('CAVE 10 OF 20');

  await page.reload();
  await expect(page.locator('.panel h1')).toHaveText('GRAVITY HAULER');
  await expect(page.getByRole('option', { name: /Continue/ })).toContainText('Crucible');
});

test('keeps the simulation at real time on the largest level', async ({ page }) => {
  await bootWithoutSave(page);
  await page.getByText('Enter password').click();
  await page.locator('#pw').fill('eventide');
  await page.locator('#pw').press('Enter');
  await page.getByRole('option', { name: /Launch/ }).click();
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

  // Below roughly 4 fps the loop's frame-time clamp - the spiral-of-death
  // guard - deliberately lets simulated time fall behind rather than trying to
  // catch up forever, and SwiftShader sits right around there. So the bar is
  // "does not stall, and never runs fast", not exact parity. On real hardware
  // this margin is not in play at all.
  expect(elapsedSim).toBeGreaterThan(elapsedWall * 0.55);
  expect(elapsedSim).toBeLessThan(elapsedWall * 1.05);

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

async function simTime(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as never as { game: { world: { time: number } } }).game.world.time,
  );
}
