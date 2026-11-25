import { expect, test, type Page } from '@playwright/test'

async function upload(page: Page) {
  await page.getByRole('button',{name:'Artwork',exact:true}).click()
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', {name: /Upload artwork/}).click(),
  ])
  await chooser.setFiles({name:'orientation.svg',mimeType:'image/svg+xml',
    buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><path fill="#00ff00" d="M0 0h150v120H0z"/><path fill="#ff00ff" d="M150 0h150v120H150z"/></svg>')})
  await expect(page.getByRole('button',{name:'orientation.svg',exact:true})).toBeVisible()
}

async function proofName(page: Page) {
  const [file] = await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download production proof'}).click()])
  return file.suggestedFilename()
}

test('same-price edits identify distinct proofs and missing uploads block draft and cart exports',async ({page})=>{
  await page.goto('/')
  await upload(page)
  const first = await proofName(page)
  await page.getByLabel('Position X (%)').fill('57')
  const second = await proofName(page)
  expect(second).not.toEqual(first)
  expect(await proofName(page)).toEqual(second)
  await page.getByRole('button',{name:'Add design to cart'}).click()
  const cartProof = page.getByRole('dialog').getByRole('button',{name:'Production proof',exact:true})
  const [cartFile] = await Promise.all([page.waitForEvent('download'),cartProof.click()])
  await cartFile.saveAs(test.info().outputPath('cart-proof.pdf'))
  expect(cartFile.suggestedFilename()).toMatch(/^canopy-[0-9a-f-]{36}\.pdf$/)
  await page.getByRole('button',{name:'Close cart'}).click()
  expect(await proofName(page)).toEqual(cartFile.suggestedFilename())
  await page.evaluate(async()=>{
    const draft = JSON.parse(localStorage.getItem('canopy-studio-draft-v1')!)
    const id = draft.panels['front-roof'].layers.find((l:{type:string})=>l.type==='image').assetId
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('canopy-studio-assets')
      request.onsuccess=()=>{
        const db=request.result
        const tx=db.transaction('images','readwrite')
        tx.objectStore('images').delete(id)
        tx.oncomplete=()=>{db.close();resolve()}
        tx.onerror=()=>reject(tx.error)
      }
    })
  })
  await page.reload()
  const unexpected:string[]=[]
  page.on('download',d=>unexpected.push(d.suggestedFilename()))
  await expect(page.getByRole('alert')).toContainText('orientation.svg')
  await page.getByRole('button',{name:'Dismiss message'}).click()
  await page.getByRole('button',{name:'Download production proof'}).click()
  await expect(page.getByRole('alert')).toContainText('Front roof (orientation.svg)')
  await page.getByRole('button',{name:'Dismiss message'}).click()
  await page.getByRole('button',{name:'Add design to cart'}).click()
  await expect(page.getByRole('alert')).toContainText('orientation.svg')
  await page.getByRole('button',{name:/Open cart, 1 designs/}).click()
  await cartProof.click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('orientation.svg')
  expect(unexpected).toEqual([])
})

test('asymmetric artwork reads left to right on both wall faces',async ({page})=>{
  await page.goto('/')
  await page.getByText('Drag to orbit',{exact:false}).waitFor()
  await page.getByRole('button',{name:'Product options'}).click()
  await page.getByRole('combobox',{name:'Side walls',exact:true}).selectOption('back')
  await page.getByRole('combobox',{name:'Side wall print',exact:true}).selectOption('double')
  await page.getByRole('button',{name:'Back wall',exact:true}).click()
  await upload(page)
  await page.getByLabel('Width (%)').fill('50')
  await page.getByRole('button',{name:'3D preview',exact:true}).click()
  const viewer=page.locator('.webgl-stage canvas')
  for(const face of ['Back wall','Front valance']){
    await page.getByRole('button',{name:face,exact:true}).click()
    await viewer.press('ArrowDown')
    await viewer.press('ArrowDown')
    await expect.poll(async()=>{
      const shot=await viewer.screenshot({path:'test-results/wall-'+face+'.png'})
      return page.evaluate(async bytes=>{
        const img=new Image()
        img.src='data:image/png;base64,'+bytes
        await img.decode()
        const canvas=document.createElement('canvas')
        canvas.width=img.width;canvas.height=img.height
        const ctx=canvas.getContext('2d')!
        ctx.drawImage(img,0,0)
        const pixels=ctx.getImageData(0,0,img.width,img.height).data
        let greens=0,pinks=0,gx=0,px=0
        for(let i=0;i<pixels.length;i+=4){
          const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]]
          const x=(i/4)%img.width
          if(g>80 && g>r*1.6 && g>b*1.6){greens++;gx+=x}
          if(r>80 && b>80 && r>g*1.6 && b>g*1.6){pinks++;px+=x}
        }
        return greens>25 && pinks>25 && gx/greens+5<px/pinks
      },shot.toString('base64'))
    },{message:face+' view must show green left of magenta',timeout:12000}).toBe(true)
  }
})


test('oversized rotated roof artwork stays inside the printable triangle and its atlas tile', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      if (args[0] === '2d' && this.width === 2048 && this.height === 2048) {
        Object.assign(window, { testAtlas: this })
      }
      return Reflect.apply(original, this, args)
    } as typeof original
  })
  await page.goto('/')
  await page.getByText('Drag to orbit', { exact: false }).waitFor()
  const pixels = () => page.evaluate(() => {
    const atlas = (window as Window & {testAtlas: HTMLCanvasElement}).testAtlas
    const tile = atlas.width / 4
    const ctx = atlas.getContext('2d')!
    const { data } = ctx.getImageData(0, 0, tile * 2, tile)
    let inside = 0, outside = 0, neighbor = 0
    for (let y = 0; y < tile; y++) for (let x = 0; x < tile * 2; x++) {
      const offset = 4 * (y * tile * 2 + x)
      const [r, g, b] = data.subarray(offset, offset + 3)
      if (!(g > 200 && r < 50 && b < 50 || r > 200 && b > 200 && g < 50)) continue
      const height = (tile - 8) * .49
      if (x >= tile) neighbor++
      else if (y > height + 5 || Math.abs(x - tile / 2) > (y - 4) / height * (tile - 8) / 2 + 2) outside++
      else inside++
    }
    return { inside, outside, neighbor }
  })
  await upload(page)
  await page.getByLabel('Width (%)').fill('130')
  await page.getByLabel('Rotation (°)').fill('25')
  await page.getByLabel('Position X (%)').fill('92')
  await page.getByRole('button', { name: '3D preview', exact: true }).click()
  await expect.poll(async () => (await pixels()).inside).toBeGreaterThan(100)
  expect(await pixels()).toMatchObject({ outside: 0, neighbor: 0 })
  await page.getByRole('button', { name: 'Right roof', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Right roof' })).toBeVisible()
})

test('mobile embedded design keeps host navigation, price and saved cart in sync', async ({page}) => {
  await page.setViewportSize({width:375,height:812})
  // Load the real host page from a different origin than the designer. Locally, Chrome's
  // local-network protection blocks a public page from framing 127.0.0.1, so use localhost
  // vs 127.0.0.1 (the demo's ?cross=1 switch). Against a deployment, serve the host from a fake origin.
  const base = new URL(test.info().project.use.baseURL!)
  if (['127.0.0.1', 'localhost'].includes(base.hostname)) {
    base.hostname = base.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
    await page.goto(base.origin + '/embed-demo.html?cross=1')
  } else {
    const html = (await (await page.request.get('/embed-demo.html')).text())
      .replace("new URL('/', location.origin)", "new URL('/', " + JSON.stringify(base.origin) + ")")
    await page.route('https://embed-host.test/demo', route => route.fulfill({contentType:'text/html',body:html}))
    await page.goto('https://embed-host.test/demo')
  }
  const host = page.getByRole('status')
  await expect(host).toHaveText('Configurator connected.')
  const frame = page.frameLocator('#designer')
  await frame.getByRole('link',{name:'Canopy Studio home'}).click()
  await expect(frame.getByRole('button',{name:'Save & exit'})).toBeVisible()
  await frame.getByRole('button',{name:'Product options'}).click()
  await frame.getByRole('button',{name:'Start a blank design'}).click()
  await frame.getByLabel('Tent size').selectOption('5x5')
  await frame.getByLabel('Quantity').fill('2')
  await frame.getByRole('button',{name:'Right roof',exact:true}).click()
  await frame.getByRole('button',{name:'Text',exact:true}).click()
  await frame.getByRole('button',{name:'Add text'}).click()
  await frame.getByRole('textbox',{name:'Text',exact:true}).fill('Event crew')
  await expect(frame.locator('.quote-total b')).toHaveText('$682.00')
  await frame.getByRole('button',{name:'Save & exit'}).click()
  await expect(host).toHaveText('The host received the saved design.')
  await page.getByRole('button',{name:'Reopen designer'}).click()
  await frame.getByRole('button',{name:'Add design to cart'}).click()
  await expect(host).toContainText('received cart configuration')
  await expect(page.locator('#payload pre')).toContainText('mock:canopy-5x5')
  await expect(page.locator('#payload pre')).toContainText('_production_proof')
  await expect(frame.locator('.cart-total b')).toHaveText('$682.00')
  await frame.getByRole('button',{name:'Remove',exact:true}).click()
  await expect(frame.getByRole('dialog')).toContainText('Your cart is empty.')
})

test('half walls combine with a full back wall, are priced by the API and listed in the cart', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button',{name:'Product options'}).click()
  await page.getByRole('button',{name:'Start a blank design'}).click()
  const total = page.locator('.quote-total b')
  await expect(total).toHaveText('$529.00')
  await page.getByRole('combobox',{name:'Side walls',exact:true}).selectOption('back')
  await page.getByRole('combobox',{name:'Half walls',exact:true}).selectOption('double')
  await expect(total).toHaveText('$746.00')
  for (const wall of ['Back wall','Left wall','Right wall']) await expect(page.getByRole('button',{name:wall,exact:true})).toBeVisible()
  await page.getByRole('combobox',{name:'Side walls',exact:true}).selectOption('three')
  await expect(page.getByRole('combobox',{name:'Half walls',exact:true})).toBeDisabled()
  await expect(page.getByRole('combobox',{name:'Half walls',exact:true})).toHaveValue('none')
  await expect(total).toHaveText('$728.00')
  await page.getByRole('combobox',{name:'Side walls',exact:true}).selectOption('none')
  await expect(page.getByRole('button',{name:'Back wall',exact:true})).toHaveCount(0)
  await page.getByRole('combobox',{name:'Half walls',exact:true}).selectOption('single')
  await page.getByText('Drag to orbit',{exact:false}).waitFor()
  await page.getByRole('button',{name:'Add design to cart'}).click()
  await expect(page.getByRole('dialog')).toContainText('Half walls: Set of 2, single-sided print')
})

test('a burst of typing is one undo step and the 2D editor supports keyboard nudging and deletion', async ({page}) => {
  await page.goto('/')
  await page.getByRole('button',{name:'Text',exact:true}).click()
  await page.getByRole('button',{name:'Add text'}).click()
  const field = page.getByRole('textbox',{name:'Text',exact:true})
  await field.fill('')
  await field.pressSequentially('Crew', {delay: 30})
  await page.getByRole('button',{name:'Undo'}).click()
  await expect(page.getByRole('button',{name:'Your text',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Redo'}).click()
  await expect(page.getByRole('button',{name:'Crew',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Crew',exact:true}).click()
  const x = page.getByLabel('Position X (%)')
  await x.fill('')
  await expect(x).toHaveValue('')
  await x.blur()
  await expect(x).toHaveValue('50')
  const canvas = page.locator('.editor-canvas')
  await canvas.focus()
  await canvas.press('ArrowRight')
  await canvas.press('Shift+ArrowRight')
  await expect(x).toHaveValue('56')
  await canvas.press('Delete')
  await expect(page.getByRole('button',{name:'Crew',exact:true})).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('button',{name:'Crew',exact:true})).toBeVisible()
})

test('corrupt cart storage is ignored instead of breaking the page', async ({page}) => {
  await page.addInitScript(() => localStorage.setItem('canopy-studio-cart-v1', JSON.stringify([{ id: 'x' }, null, 4])))
  await page.goto('/')
  await expect(page.getByRole('button',{name:/Open cart, 0 designs/})).toBeVisible()
})
