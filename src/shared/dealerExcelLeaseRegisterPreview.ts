import type {DealerDraftRow} from './dealerMasterDraft';
import {dealerLeaseFormSuggestions} from './dealerExcelLeasePrefill';

/** A virtual, read-only Excel row for the Registered Agreements screen.
 * Do not present as a signed, executed, or independently verified agreement.
 * Operational agreement writes occur only through the existing explicit Save API.
 */
export function getExcelLandLeaseRegisterPreview(
  row:DealerDraftRow|null|undefined,
  selectedRoCode:string,
  hasRegisteredLandLease:boolean,
){
  if(!row||row.roCode.trim()!==selectedRoCode.trim()||hasRegisteredLandLease)
    return null;
  const f=row.fields;
  const raw=(key:string)=>(f[key]||'').trim();
  const anyLeaseEvidence=[
    'CUST LAND DESC (LAND STATUS)','LAND OWNER','FROM','TO','ORDER NO.',
    'RENT (monthly)','AREA','measuring unit','DURATION (YEARS)',
  ].some(key=>Boolean(raw(key)));
  if(!anyLeaseEvidence)return null;
  const suggestion=dealerLeaseFormSuggestions(row);
  return {
    roCode:row.roCode,
    label:'Land Lease — Excel Source',
    status:'Excel Import',
    owner:raw('LAND OWNER'),
    landStatus:raw('CUST LAND DESC (LAND STATUS)'),
    orderReference:raw('ORDER NO.'),
    startDate:suggestion.startDate||raw('FROM'),
    endDate:suggestion.endDate||raw('TO'),
    duration:[raw('DURATION (YEARS)'),raw('Duration (Months)')].filter(Boolean).join(' years / '),
    area:[raw('AREA'),raw('measuring unit')].filter(Boolean).join(' '),
    rentMonthly:raw('RENT (monthly)'),
  };
}
