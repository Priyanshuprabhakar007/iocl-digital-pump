const fs = require('fs');

// 1. OutletsPage.tsx
let outletsCode = fs.readFileSync('src/frontend/pages/OutletsPage.tsx', 'utf8');
if (!outletsCode.includes('SectionSearchBar')) {
  outletsCode = outletsCode.replace(
    "import { PERMISSIONS } from '../../shared/constants';",
    "import { PERMISSIONS } from '../../shared/constants';\nimport { SectionSearchBar } from '../components/common/SectionSearchBar';\nimport { matchesSearch } from '../utils/searchUtils';"
  );
  outletsCode = outletsCode.replace(
    "const [showHidden, setShowHidden] = useState(false);",
    "const [showHidden, setShowHidden] = useState(false);\n  const [searchQuery, setSearchQuery] = useState('');"
  );
  outletsCode = outletsCode.replace(
    "const displayedOutlets = showHidden ? outlets : outlets.filter(o => !o.directoryHidden);",
    "const visibilityFilteredOutlets = showHidden ? outlets : outlets.filter(o => !o.directoryHidden);\n        const displayedOutlets = visibilityFilteredOutlets.filter(ro => {\n          if (!searchQuery.trim()) return true;\n          const fields = [\n            ro.name, ro.roCode, ro.outletType, ro.stateName, ro.stateId,\n            ro.divisionName, ro.divisionId, ro.salesAreaName, ro.salesAreaId,\n            ro.address, ro.city, ro.district, ro.pincode, ro.status,\n            showHidden && ro.directoryHidden ? 'hidden' : ''\n          ];\n          return matchesSearch(searchQuery, fields);\n        });"
  );
  outletsCode = outletsCode.replace(
    "Showing {displayedOutlets.length} accessible record(s)",
    "{searchQuery.trim() ? `Showing ${displayedOutlets.length} of ${visibilityFilteredOutlets.length} accessible records` : `Showing ${displayedOutlets.length} accessible record(s)`}"
  );
  outletsCode = outletsCode.replace(
    '</div>            {/* Outlet Cards / Table */}',
    '</div>\n            <SectionSearchBar\n              value={searchQuery}\n              onChange={setSearchQuery}\n              placeholder="Search outlet name, RO code, city, sales area..."\n              resultCount={displayedOutlets.length}\n              totalCount={visibilityFilteredOutlets.length}\n            />\n            {/* Outlet Cards / Table */}'
  );
  outletsCode = outletsCode.replace(
    '<p className="text-sm font-semibold text-slate-300">No Retail Outlets Accessible</p>',
    '<p className="text-sm font-semibold text-slate-300">{searchQuery.trim() ? \'No matching retail outlets within your authorized scope.\' : \'No Retail Outlets Accessible\'}</p>'
  );
  fs.writeFileSync('src/frontend/pages/OutletsPage.tsx', outletsCode, 'utf8');
  console.log('OutletsPage updated.');
}

// 2. UsersPage.tsx
let usersCode = fs.readFileSync('src/frontend/pages/UsersPage.tsx', 'utf8');
if (!usersCode.includes('SectionSearchBar')) {
  usersCode = usersCode.replace(
    "import { PERMISSIONS, ROLES } from '../../shared/constants';",
    "import { PERMISSIONS, ROLES } from '../../shared/constants';\nimport { SectionSearchBar } from '../components/common/SectionSearchBar';\nimport { matchesSearch } from '../utils/searchUtils';"
  );
  usersCode = usersCode.replace(
    "const [users, setUsers] = useState<any[]>([]);",
    "const [users, setUsers] = useState<any[]>([]);\n  const [searchQuery, setSearchQuery] = useState('');"
  );
  usersCode = usersCode.replace(
    "{users.map((u) => {",
    "const filteredUsers = users.filter(u => {\n    if (!searchQuery.trim()) return true;\n    const fields = [\n      u.name, u.empCode, u.email, u.phone, u.status,\n      ...(u.roles || []),\n      ...(u.scopes || []).map((s) => s.scopeLevel)\n    ];\n    return matchesSearch(searchQuery, fields);\n  });\n  return (\n    <div className=\"space-y-4\">\n      <SectionSearchBar\n        value={searchQuery}\n        onChange={setSearchQuery}\n        placeholder=\"Search employee name, code, email, role or scope...\"\n        resultCount={filteredUsers.length}\n        totalCount={users.length}\n      />\n      {filteredUsers.length === 0 ? (\n        <div className=\"py-12 text-center border border-dashed border-slate-800 rounded-2xl p-8 bg-slate-950/50 space-y-2\">\n          <p className=\"text-sm font-semibold text-slate-300\">No matching users within your authorized scope.</p>\n        </div>\n      ) : (\n        <div className=\"bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl\">\n          <div className=\"overflow-x-auto\">\n            <table className=\"w-full text-left text-xs\">\n              <thead className=\"bg-slate-800/80 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-700/80\">\n                <tr>\n                  <th className=\"p-4\">Employee</th>\n                  <th className=\"p-4\">Roles</th>\n                  <th className=\"p-4\">Primary Scope</th>\n                  <th className=\"p-4\">Status</th>\n                  <th className=\"p-4 text-right\">Actions</th>\n                </tr>\n              </thead>\n              <tbody className=\"divide-y divide-slate-800 text-slate-200\">\n                {filteredUsers.map((u) => {"
  );
  usersCode = usersCode.replace(
    "          </div>\n        </div>\n      )}",
    "          </div>\n        </div>\n      )}\n    </div>\n  );\n}"
  );
  fs.writeFileSync('src/frontend/pages/UsersPage.tsx', usersCode, 'utf8');
  console.log('UsersPage updated.');
}

// 3. ScopesPage.tsx
let scopesCode = fs.readFileSync('src/frontend/pages/ScopesPage.tsx', 'utf8');
if (!scopesCode.includes('SectionSearchBar')) {
  scopesCode = scopesCode.replace(
    "import { PERMISSIONS, SCOPE_LEVELS, ScopeLevel } from '../../shared/constants';",
    "import { PERMISSIONS, SCOPE_LEVELS, ScopeLevel } from '../../shared/constants';\nimport { SectionSearchBar } from '../components/common/SectionSearchBar';\nimport { matchesSearch } from '../utils/searchUtils';"
  );
  scopesCode = scopesCode.replace(
    "const [loading, setLoading] = useState(true);",
    "const [loading, setLoading] = useState(true);\n  const [searchQuery, setSearchQuery] = useState('');"
  );
  scopesCode = scopesCode.replace(
    "{scopes.map((s) => {",
    "const filteredScopes = scopes.filter(s => {\n    if (!searchQuery.trim()) return true;\n    const matchingUser = users.find(u => u.id === s.userId);\n    const fields = [\n      s.scopeLevel, s.stateName, s.stateId, s.divisionName, s.divisionId,\n      s.salesAreaName, s.salesAreaId, s.outletName, s.outletId,\n      matchingUser?.name, matchingUser?.empCode, matchingUser?.email,\n    ];\n    return matchesSearch(searchQuery, fields);\n  });\n  return (\n    <div className=\"space-y-4\">\n      <SectionSearchBar\n        value={searchQuery}\n        onChange={setSearchQuery}\n        placeholder=\"Search user, employee code, scope or organizational unit...\"\n        resultCount={filteredScopes.length}\n        totalCount={scopes.length}\n      />\n      {filteredScopes.length === 0 ? (\n        <div className=\"py-12 text-center border border-dashed border-slate-800 rounded-2xl p-8 bg-slate-950/50 space-y-2\">\n          <p className=\"text-sm font-semibold text-slate-300\">No matching scope assignments within your authorized organizational boundary.</p>\n        </div>\n      ) : (\n        <div className=\"bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl\">\n          <div className=\"overflow-x-auto\">\n            <table className=\"w-full text-left text-xs\">\n              <thead className=\"bg-slate-800/80 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-700/80\">\n                <tr>\n                  <th className=\"p-4\">User / Employee</th>\n                  <th className=\"p-4\">Scope Level</th>\n                  <th className=\"p-4\">Organizational Boundary</th>\n                  <th className=\"p-4\">Assigned By</th>\n                  <th className=\"p-4 text-right\">Actions</th>\n                </tr>\n              </thead>\n              <tbody className=\"divide-y divide-slate-800 text-slate-200\">\n                {filteredScopes.map((s) => {"
  );
  scopesCode = scopesCode.replace(
    "          </div>\n        </div>\n      )}",
    "          </div>\n        </div>\n      )}\n    </div>\n  );\n}"
  );
  fs.writeFileSync('src/frontend/pages/ScopesPage.tsx', scopesCode, 'utf8');
  console.log('ScopesPage updated.');
}

// 4. RbacPage.tsx
let rbacCode = fs.readFileSync('src/frontend/pages/RbacPage.tsx', 'utf8');
if (!rbacCode.includes('permissionSearch')) {
  rbacCode = rbacCode.replace(
    "import { UserPermissionsDetails } from '../../shared/types';",
    "import { UserPermissionsDetails } from '../../shared/types';\nimport { SectionSearchBar } from '../components/common/SectionSearchBar';\nimport { matchesSearch } from '../utils/searchUtils';"
  );
  rbacCode = rbacCode.replace(
    "const [permissions, setPermissions] = useState<any[]>([]);",
    "const [permissions, setPermissions] = useState<any[]>([]);\n  const [permissionSearch, setPermissionSearch] = useState('');"
  );
  rbacCode = rbacCode.replace(
    "{permissions.map((p) => {",
    "const filteredPermissions = permissions.filter(p => {\n    if (!permissionSearch.trim()) return true;\n    const q = permissionSearch.trim().toLowerCase();\n    const fields = [p.code, p.name, p.description];\n    const baseMatch = matchesSearch(permissionSearch, fields);\n    const matchingRole = roles.find(r => r.code.toLowerCase().includes(q) || (r.name && r.name.toLowerCase().includes(q)));\n    if (matchingRole) {\n      const isGrantedToRole = matchingRole.code === 'ADMIN' || matchingRole.permissions?.some((pItem) => pItem.code === p.code);\n      return baseMatch || isGrantedToRole;\n    }\n    return baseMatch;\n  });\n  return (\n    <div className=\"space-y-6\">\n      <SectionSearchBar\n        value={permissionSearch}\n        onChange={setPermissionSearch}\n        placeholder=\"Search permission code, description or role...\"\n        resultCount={filteredPermissions.length}\n        totalCount={permissions.length}\n      />\n      {filteredPermissions.length === 0 ? (\n        <div className=\"py-12 text-center border border-dashed border-slate-800 rounded-2xl p-8 bg-slate-950/50\">\n          <p className=\"text-sm font-semibold text-slate-300\">No matching permissions or roles found.</p>\n        </div>\n      ) : (\n        <div className=\"bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl\">\n          <div className=\"overflow-x-auto\">\n            <table className=\"w-full text-left text-xs\">\n              <thead className=\"bg-slate-800/80 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-700/80\">\n                <tr>\n                  <th className=\"p-4\">Permission Code</th>\n                  <th className=\"p-4\">Description</th>\n                  {roles.map((r) => (\n                    <th key={r.id} className=\"p-4 text-center font-bold text-white whitespace-nowrap\">\n                      {r.code}\n                    </th>\n                  ))}\n                  {selectedUserId && (\n                    <th className=\"p-4 text-center bg-purple-950/40 text-purple-200 border-l border-purple-800/60 min-w-[200px]\">\n                      <div className=\"font-bold text-xs uppercase tracking-wide text-purple-300\">\n                        USER ACCESS\n                      </div>\n                      <div className=\"text-[10px] font-normal text-purple-200/80 truncate max-w-[180px] mx-auto mt-0.5\">\n                        {selectedUserDetails?.user.name || selectedUserMeta?.name || 'Selected User'}\n                      </div>\n                    </th>\n                  )}\n                </tr>\n              </thead>\n              <tbody className=\"divide-y divide-slate-800 text-slate-200\">\n                {filteredPermissions.map((p) => {"
  );
  rbacCode = rbacCode.replace(
    "          </div>\n        </div>\n      )}",
    "          </div>\n        </div>\n      )}\n    </div>\n  );"
  );
  fs.writeFileSync('src/frontend/pages/RbacPage.tsx', rbacCode, 'utf8');
  console.log('RbacPage updated.');
}
