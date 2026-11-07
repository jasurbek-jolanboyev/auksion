export const API_BASE=(import.meta.env.VITE_API_BASE_URL||'/api/v1').replace(/\/$/,'');
export async function api(path,options={}){
  const headers={Accept:'application/json',...(options.headers||{})};
  let body=options.body;
  if(body&&!(body instanceof FormData)){headers['Content-Type']='application/json';body=JSON.stringify(body)}
  const response=await fetch(API_BASE+path,{method:options.method||'GET',headers,body,credentials:'include',signal:options.signal});
  let result={};try{result=await response.json()}catch{}
  if(!response.ok){const e=new Error(result.message||`Server xatosi (${response.status})`);e.status=response.status;e.data=result;throw e}
  return result;
}
