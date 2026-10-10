// Feigin EMS to Claude boundary: synthetic-only preflight. No network or tenant grants.
// Real source on OVH binds localhost and requires a separately authorized tunnel/proxy.
import crypto from 'node:crypto';
const SCOPE_FIELDS = ['tenant_id','project_id','object_id','meter_id'];
export function authorizeEmsRequest({enabled,authenticatedScope,requestedScope,source='SYNTHETIC',exportApproved=false}={}) {
 if(enabled!==true) throw Error('EMS_CLAUDE_ADAPTER_DISABLED');
 if(!authenticatedScope || !requestedScope) throw Error('AUTHENTICATED_SCOPE_REQUIRED');
 for(const key of SCOPE_FIELDS) {
   if(typeof authenticatedScope[key]!=='string'||!authenticatedScope[key].trim()||
      requestedScope[key]!==authenticatedScope[key]) throw Error('TENANT_ASSET_SCOPE_DENIED');
 }
 if(source==='REAL' && exportApproved!==true) throw Error('REAL_EMS_EXPORT_NOT_APPROVED');
 if(source!=='REAL'&&source!=='SYNTHETIC') throw Error('SOURCE_CLASS_DENIED');
 return Object.freeze({...Object.fromEntries(SCOPE_FIELDS.map(k=>[k,authenticatedScope[k]])),source,
  evidence_sha256:crypto.createHash('sha256').update(JSON.stringify(SCOPE_FIELDS.map(k=>authenticatedScope[k]))).digest('hex')});
}
export function validateSourceEndpoint(url) {
 const u=new URL(url);
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw Error('HTTPS_SOURCE_GATEWAY_REQUIRED');
 return u.origin+u.pathname;
}
