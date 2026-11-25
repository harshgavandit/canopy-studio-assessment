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
  expect(cartFile.suggestedFilename()).toMatch(/^canopy-[0-9a-f-]{36}\.pdf$/)
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
  await page.getByRole('combobox',{name:'Walls',exact:true}).selectOption('back')
  await page.getByLabel('Double-sided wall printing').check()
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

