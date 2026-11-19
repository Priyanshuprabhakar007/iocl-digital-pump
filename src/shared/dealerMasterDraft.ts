import {z} from 'zod';
import {dealerMasterFieldCatalog,normalizedDealerHeader} from './dealerMasterFieldCoverage';

const sourceRecord=z.object({
  sourceRow:z.number().int().min(2).max(100000),
  roCode:z.string().trim().min(4).max(12),
  sourceDetails:z.record(z.string(),z.string().max(4000)),
  city:z.string().trim().max(120).default(''),
  pincode:z.string().trim().max(12).default(''),
  yellowHeaders:z.array(z.string().max(180)).max(35).default([]),
}).strict();

export const dealerDraftSaveSchema=z.object({
  sourceFileName:z.string().trim().min(5).max(255).refine(v=>/\.xlsx?$/i.test(v),'Excel file required'),
  sourceFileSha256:z.string().regex(/^[a-f0-9]{64}$/),
  sourceSheetName:z.string().trim().min(1).max(160),
  importPolicy:z.literal('FULL_INCLUDING_YELLOW'),
  confirmedDraftOnly:z.literal(true),
  rows:z.array(sourceRecord).min(1).max(500),
}).strict();

export type DealerDraftSaveInput=z.input<typeof dealerDraftSaveSchema>;
export type DealerDraftRow={
  sourceRow:number;roCode:string;fields:Record<string,string>;
  city:string;pincode:string;yellowHeaders:string[];
};
export type DealerDraftContents={schemaVersion:1;businessColumns:string[];rows:DealerDraftRow[]};
export type DealerDraftMeta={
  id:string;fileName:string;sourceSheetName:string;fileSha256:string;
  rowCount:number;status:'DRAFT';createdAt:string;
};
export type DealerDraftStatus={storageReady:boolean;canSaveDraft:boolean;message:string};
export type DealerDraftResponse={
  draftId:string;action:'SAVED'|'ALREADY_SAVED';status:'DRAFT';
  rowCount:number;matchedExisting:number;newRoCandidates:number;
};

/** Normalize precisely the 26 dealer source fields. Never infer City/PIN,
 * create an outlet, or treat workbook fill colour as a write policy. */
export function normalizeDealerDraft(payload:unknown):DealerDraftContents{
  const source=dealerDraftSaveSchema.parse(payload);
  const seenCodes=new Set<string>(),seenRows=new Set<number>();
  const columnKeys=new Set(dealerMasterFieldCatalog.map(f=>normalizedDealerHeader(f.header)));
  const rows:DealerDraftRow[]=[];
  for(const row of source.rows){
    const code=row.roCode.trim();
    if(!/^\d{4,12}$/.test(code))throw Error('INVALID_DRAFT_RO_CODE: '+code);
    if(seenCodes.has(code))throw Error('DUPLICATE_DRAFT_RO_CODE: '+code);
    if(seenRows.has(row.sourceRow))throw Error('DUPLICATE_SOURCE_EXCEL_ROW');
    seenCodes.add(code);seenRows.add(row.sourceRow);
    const lookup=new Map<string,string>();
    for(const [header,value] of Object.entries(row.sourceDetails)){
      if(header.length>180)throw Error('INVALID_EXCEL_COLUMN_NAME');
      const normalized=normalizedDealerHeader(header);
      if(!columnKeys.has(normalized))continue; // ignore S. NO. serial number
      if(lookup.has(normalized))throw Error('DUPLICATE_EXCEL_COLUMN: '+header);
      lookup.set(normalized,value);
    }
    const fields:Record<string,string>={};
    for(const col of dealerMasterFieldCatalog){
      const normalized=normalizedDealerHeader(col.header);
      if(!lookup.has(normalized))throw Error('MISSING_SOURCE_COLUMN: '+col.header);
      fields[col.header]=lookup.get(normalized)||'';
    }
    if(fields.CUSTCODE.trim()!==code)throw Error('SOURCE_CODE_MISMATCH: '+code);
    if(!fields['CUSTOMER  NAME (NAME OF  RO)'].trim())
      throw Error('MISSING_SOURCE_RO_NAME: '+code);
    if((row.city||row.pincode)&&(!row.city||!/^\d{6}$/.test(row.pincode)))
      throw Error('INVALID_CITY_PIN_SUPPLEMENT: '+code);
    rows.push({
      sourceRow:row.sourceRow,roCode:code,fields,city:row.city,
      pincode:row.pincode,
      yellowHeaders:[...new Set(row.yellowHeaders.map(normalizedDealerHeader))]
        .filter(header=>columnKeys.has(header)),
    });
  }
  return {schemaVersion:1,businessColumns:dealerMasterFieldCatalog.map(c=>c.header),rows};
}

export function serializeDealerDraft(contents:DealerDraftContents):string{
  const text=JSON.stringify(contents);
  if(new TextEncoder().encode(text).length>600000)
    throw Error('DRAFT_TOO_LARGE: upload a smaller workbook');
  return text;
}
