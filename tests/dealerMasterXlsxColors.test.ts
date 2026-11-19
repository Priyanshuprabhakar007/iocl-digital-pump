import {describe,expect,it} from 'vitest';
import {readYellowProtectionFromXlsx} from '../src/shared/dealerMasterXlsxColors';
const sample='UEsDBBQAAAAIAKMhc111sxNXkgAAAOQAAAAPAAAAeGwvd29ya2Jvb2sueG1sjY8xDoMwDEWvEvkANXTogICpS4cewgXTRJA4slO1xy+Csney///y+3L7Fp0fIrP7xCVZB76U3CDa4DmSnSRzWpNJNFJZpT7RsjKN5plLXPBcVReMFBLshEb/Ycg0hYGvMrwip7JDlBcqQZL5kA36dmuw33SJIndwJyus4DbvNnZQg9MmrIvexhqwb/E4w+Oz/gtQSwMEFAAAAAgAoyFzXbZUqs+OAAAA8QAAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc43PPQ7CMAwF4KtUOUDdMjCgJhNLV8QFotRtojY/so2A2xMxoCIxMFl+lr4nDxfcrISc2IfCzSNuibXyIuUEwM5jtNzmgqle5kzRSl1pgWLdaheEQ9cdgfaGMsPebMZJKxqnXjXXZ8F/7DzPweE5u1vEJD8q4J5pZY8oFbW0oGj1iRjeo2+rqsAM8PWheQFQSwMEFAAAAAgAoyFzXcapVFG7AAAAZQEAAA0AAAB4bC9zdHlsZXMueG1sjZC7DsIwDEV/JcoHkFIEA0qyICExw8AaWvchOQ/FQaJ/TxoqYAMv9rV9rhJLShPCeQBI7GHRkeJDSmEvBDUDWEMrH8DlSeejNSnL2AsKEUxLM2RR1FW1E9aMjmvZjYjEGn93SfHN0tAymJQgumMWbKkvUwDFnXfAhZbitfdju49mWtfb/wHyOLbzK/qDRx9Z7G+KH0tUVbH5Qt+mJZGWDSBeu/d36mz06Ng8PLWKF/5L18VvYXL1Oax+AlBLAwQUAAAACACjIXNdxoC9WooAAAD9AAAAGAAAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbGWP3QoCIRBGX0V8gMZdoYtwhaIXGTbLaP1hFLbHz9Vwg+4+P88ZZtQa6JWsMZm93eLTxG3O8QSQZmscpkOIxpefeyCHuTzpASmSwVuV3AKjEEdw+PRcq9pdMaNWFFZGEx9KO2/hPHD4xkuNUIiOjR0bOUub1uFWiD9FdkXuRFPkPqMp8LMY9Iv1B1BLAQIUAxQAAAAIAKMhc111sxNXkgAAAOQAAAAPAAAAAAAAAAAAAACAAQAAAAB4bC93b3JrYm9vay54bWxQSwECFAMUAAAACACjIXNdtlSqz44AAADxAAAAGgAAAAAAAAAAAAAAgAG/AAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAMUAAAACACjIXNdxqlUUbsAAABlAQAADQAAAAAAAAAAAAAAgAGFAQAAeGwvc3R5bGVzLnhtbFBLAQIUAxQAAAAIAKMhc13GgL1aigAAAP0AAAAYAAAAAAAAAAAAAACAAWsCAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwUGAAAAAAQABAAGAQAAKwMAAAAA';
describe('Original XLSX ZIP yellow style lookup',()=>{
  it('recognizes individual cell protection through workbook relationship and fill/style indices',()=>{
    const data=Buffer.from(sample,'base64');
    const headers=['CUSTCODE','EMAIL',...Array.from({length:18},(_,i)=>'OTHER'+i)];
    const result=readYellowProtectionFromXlsx(data,headers,2);
    expect(result.verified, 'XLSX XML yellow audit: '+(result.reason||'unknown')).toBe(true);
    expect(result.protectedCellCount).toBe(2);
    expect(result.protectedBySourceRow).toEqual({2:['CUSTCODE'],3:['EMAIL']});
  });
  it('fails closed when archive bytes or dimension are malformed',()=>{
    expect(readYellowProtectionFromXlsx(new Uint8Array([0,2,4]),Array(20).fill('A'),2).verified).toBe(false);
    expect(readYellowProtectionFromXlsx(Buffer.from(sample,'base64'),['CUSTCODE'],2).verified).toBe(false);
  });
});
