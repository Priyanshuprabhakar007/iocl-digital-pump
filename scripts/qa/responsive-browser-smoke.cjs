// Browser-only QA against an isolated local Vite build.
// All API calls are intercepted; no deployed backend, credentials or writes.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4173';
const fixtureOutlet = (id, name, roCode) => ({
  id, name, roCode, status:'ACTIVE', outletType:'COCO', stateId:'fixture-state',
  divisionId:'fixture-division', salesAreaId:'fixture-area', stateName:'Fixture State',
  divisionName:'Fixture Division', salesAreaName:'Fixture Area', address:'Fixture address',
  city:'Fixture City', district:'Fixture District', pincode:'000000', assignedUsersCount:0,
});
const outlets=[fixtureOutlet('fixture-a','Fixture Outlet A','100001'),fixtureOutlet('fixture-b','Fixture Outlet B with a deliberately long registered name','100002')];
const auth={user:{id:'fixture-reader',name:'Fixture Reader',empCode:'QA-01',email:'fixture@example.invalid'},roles:['FIELD_OFFICER'],permissions:['outlets.read','shifts.read','cng_operations.read'],primaryScope:'SALES_AREA',isGlobalAdmin:false,isGlobalScope:false,scopes:[]};
const historical={id:'fixture-old-shift',outletId:'fixture-b',businessDate:'2000-01-01',shiftTemplateId:'fixture-shift-template',shiftTemplateName:'Morning',status:'OPEN'};
const ok=data=>({success:true,data,error:null});
const fail=message=>({success:false,data:null,error:{code:'FIXTURE_FAILURE',message}});
async function main(){
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[],blocked=[],requests=[];
    page.on('pageerror',error=>errors.push(String(error)));
    let releaseFirst;
    const firstResponse=new Promise(resolve=>{releaseFirst=resolve;});
    let shiftAttempts=0;
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!==base){if(!['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname))blocked.push(req.url());return route.abort();}
      if(!url.pathname.startsWith('/api/'))return route.continue();
      requests.push(url.pathname);
      if(req.method()!=='GET'){blocked.push(req.method()+' '+url.pathname);return route.abort();}
      const path=url.pathname;
      if(path==='/api/v1/auth/me')return route.fulfill({json:ok(auth)});
      if(path==='/api/v1/outlets')return route.fulfill({json:ok(outlets)});
      if(path==='/api/v1/users'||path==='/api/v1/hierarchy/states')return route.fulfill({json:ok([])});
      if(path==='/api/v1/outlets/fixture-b/shifts'){
        shiftAttempts++;
        if(shiftAttempts===1){await firstResponse;return route.fulfill({status:503,json:fail('Fixture shift list unavailable')});}
        return route.fulfill({json:ok([historical])});
      }
      if(path.includes('/fuel/daily-summary'))return route.fulfill({status:503,json:fail('Fixture deliberately has no daily summary')});
      blocked.push(path);return route.fulfill({status:404,json:fail('Unexpected QA request')});
    });
    try{
      await page.goto(base+'/outlets');
      await page.getByRole('heading',{name:'Retail Outlets',exact:true}).waitFor();
      const outlet=page.getByRole('combobox',{name:'Active retail outlet'});
      await outlet.waitFor();
      await outlet.selectOption('fixture-b');
      assert.equal(await outlet.inputValue(),'fixture-b');
      async function checkViewport(width,height){
        await page.setViewportSize({width,height});
        const bounds=await outlet.boundingBox();
        assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1,'Outlet selector clipped at '+width);
        const docWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
        assert(docWidth<=width+1,'Document has horizontal overflow at '+width);
      }
      for(const [w,h] of [[320,640],[390,844],[768,1024],[1024,768],[1440,900],[390,844]])await checkViewport(w,h);
      const menu=page.locator('#mobile-navigation-toggle');
      await menu.click();
      let drawer=page.getByRole('dialog',{name:'Navigation menu'});
      await drawer.waitFor();
      assert.equal(await menu.getAttribute('aria-expanded'),'true');
      await page.keyboard.press('Escape');
      await drawer.waitFor({state:'hidden'});
      await page.waitForFunction(()=>document.activeElement?.id==='mobile-navigation-toggle');
      await menu.click();
      drawer=page.getByRole('dialog',{name:'Navigation menu'});
      await drawer.getByRole('searchbox',{name:'Find a page'}).fill('CNG');
      await drawer.getByRole('button',{name:'CNG Operations',exact:true}).click();
      await drawer.waitFor({state:'hidden'});
      await page.getByRole('heading',{name:'CNG Operations',exact:true}).waitFor();
      await page.getByText('Loading saved CNG records…',{exact:true}).waitFor();
      assert.equal(await page.getByRole('combobox',{name:'CNG retail outlet'}).inputValue(),'fixture-b');
      releaseFirst();
      await page.getByText('Fixture shift list unavailable',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Retry',exact:true}).click();
      await page.getByRole('heading',{name:'Select a Shift',exact:true}).waitFor();
      assert.equal(await page.getByRole('combobox',{name:'CNG operational shift'}).inputValue(),'');
      assert(shiftAttempts>=2,'Retry did not issue a fresh read');
      const childTags=await page.getByRole('combobox',{name:'CNG retail outlet'}).evaluate(el=>Array.from(el.children,child=>child.tagName));
      assert(childTags.every(tag=>tag==='OPTION'||tag==='OPTGROUP'),'Invalid select child');
      assert.equal(await page.getByRole('heading',{name:'CNG MFM & Grid Reconciliation'}).count(),0,'Unselected historical shift rendered entry form');
      assert.equal(await outlet.inputValue(),'fixture-b');
      assert(!requests.some(path=>path.includes('/shifts/fixture-old-shift')),'Historical shift was loaded without explicit selection');
      assert.deepEqual(errors,[],'Uncaught browser error');
      assert.deepEqual(blocked,[],'Unexpected API or external request');
      console.log('PASS: five responsive widths, mobile navigation and focus restore, outlet continuity, CNG loading/failure/retry, no historical auto-selection, no mutation or real backend requests.');
    }finally{releaseFirst();}
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
