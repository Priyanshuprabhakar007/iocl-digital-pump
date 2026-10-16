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

console.log('Done script.');
