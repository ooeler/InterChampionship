const { test, expect, login, openLogin } = require("./fixtures");

test.describe("Sicherheit", () => {
  test("Content-Security-Policy ist aktiv: Skripte nur aus eigenen Dateien", async ({ page }) => {
    await page.goto("/");
    const csp = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', "content");
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toBe("script-src 'self'"); // kein Inline-Code, keine Inline-Handler
    expect(await page.locator("script:not([src])").count()).toBe(0);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
  });

  test("eingeschleuster Inline-Code wird vom Browser blockiert", async ({ page }) => {
    await login(page);
    const ran = await page.evaluate(async () => {
      const d = document.createElement("div");
      d.innerHTML = '<img src="data:," onerror="window.__xss=1">';
      document.body.appendChild(d);
      await new Promise((r) => setTimeout(r, 300));
      return !!window.__xss;
    });
    expect(ran).toBe(false);
  });

  test("manipulierte Bilddaten werden nicht ins HTML übernommen", async ({ page }) => {
    await login(page);
    const r = await page.evaluate(async () => {
      S.t[0].img = 'x" onerror="window.__xss2=1';
      S.sp = "javascript:alert(1)";
      render();
      await new Promise((res) => setTimeout(res, 300));
      return { ran: !!window.__xss2, html: document.getElementById("app").innerHTML.includes("onerror"), ok: img("data:image/png;base64,iVBORw0KGgo=") };
    });
    expect(r.ran).toBe(false);
    expect(r.html).toBe(false);
    expect(r.ok).toBe("data:image/png;base64,iVBORw0KGgo=");
  });

  test("Login mit GitHub, Google und Microsoft, sobald konfiguriert", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("__mock_providers", '["google","azure","github"]'));
    await openLogin(page);
    await expect(page.locator("#auth [data-oa]")).toHaveText(["Mit Google anmelden", "Mit Microsoft anmelden", "Mit GitHub anmelden"]);
  });
});
