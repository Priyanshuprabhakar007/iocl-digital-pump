import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { GroupedWorkspaceNav, type WorkspaceGroup } from '../src/frontend/components/common/GroupedWorkspaceNav';

type Tab = 'staff'|'roster'|'attendance';
const groups:WorkspaceGroup<Tab>[]=[
  {id:'people',label:'People',items:[{id:'staff',label:'Staff directory'}]},
  {id:'duties',label:'Duties',items:[{id:'roster',label:'Shift roster'},{id:'attendance',label:'Attendance',testId:'attendance-task'}]},
  {id:'restricted',label:'Restricted settings',items:[]},
];
describe('Phase 5B grouped workspaces',()=>{
  it('renders only the active group tasks with unambiguous selected controls',()=>{
    const html=renderToStaticMarkup(React.createElement(GroupedWorkspaceNav<Tab>,{label:'Example workbench',groups,active:'attendance',onChange:()=>{}}));
    expect(html).toContain('aria-label="Duties tasks"');
    expect(html).toContain('data-testid="attendance-task"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Shift roster');
    expect(html).not.toContain('Staff directory');
    expect(html).not.toContain('Restricted settings');
  });
  it('excludes empty restricted groups, and disables all visible navigation when busy',()=>{
    const html=renderToStaticMarkup(React.createElement(GroupedWorkspaceNav<Tab>,{label:'Example workbench',groups,active:'staff',onChange:()=>{},disabled:true}));
    expect(html).toContain('disabled=""');
    expect(html).toContain('Staff directory');
    expect(html).not.toContain('Attendance');
    expect(html).not.toContain('Restricted settings');
  });
  it('preserves all three modules and their existing selected-tab handlers and guards',()=>{
    const hr=fs.readFileSync('src/frontend/pages/WorkforceOperationsPage.tsx','utf8');
    const lube=fs.readFileSync('src/frontend/pages/LubeOperationsPage.tsx','utf8');
    const pump=fs.readFileSync('src/frontend/pages/PumpInfrastructurePage.tsx','utf8');
    expect(hr).toContain('onChange={handleTabChange}');
    expect(hr).toContain('canReadAttendance ?');
    expect(hr).toContain('canReadUniform?');
    for(const id of ['staff','designations','manpower','roster','attendance','geofence','nozzle-assignment','uniforms'])expect(hr).toContain("activeTab === '"+id+"'");
    for(const id of ['sales','summary','inventory','skus','prices','transactions','daily'])expect(lube).toContain("activeTab === '"+id+"'");
    expect(lube).toContain("hasShiftsRead?'sales':'inventory'");
    for(const id of ['products','tanks','globalCalibration','dispensers','nozzles','shifts','fuelMapping'])expect(pump).toContain("activeTab === '"+id+"'");
    expect(pump).toContain('canReadTankCalibration?');
    expect(pump).toContain('tab-global-calibration-masters');
  });
  it('retains outlet archive and user access contracts with clear confirmation and errors',()=>{
    const outlets=fs.readFileSync('src/frontend/pages/OutletsPage.tsx','utf8');
    const users=fs.readFileSync('src/frontend/pages/UsersPage.tsx','utf8');
    const scopes=fs.readFileSync('src/frontend/pages/ScopesPage.tsx','utf8');
    expect(outlets).toContain('openHideConfirm(ro)');
    expect(outlets).toContain('<span>Archive</span>');
    expect(outlets).toContain('directoryError');
    expect(users).toContain('PERMISSIONS.USERS_UPDATE');
    expect(users).toContain('This changes their system access.');
    expect(users).toContain('statusLock.current=true');
    expect(users).toContain('roleFilter');
    expect(scopes).toContain('PERMISSIONS.SCOPES_ASSIGN');
    expect(scopes).toContain('window.confirm');
    expect(scopes).toContain('scopeLock.current=true');
    expect(scopes).toContain('levelFilter');
  });
});
