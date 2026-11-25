import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser', timeout: 90000, workers: 1,
  outputDir: './test-results/browser',
  use: {baseURL:'http://127.0.0.1:4186', viewport:{width:1400,height:940},
    launchOptions:{executablePath:process.env.CANOPY_BROWSER, args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
  webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4186 --strictPort',url:'http://127.0.0.1:4186',reuseExistingServer:false}
})
