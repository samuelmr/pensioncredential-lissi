import config from './config.json' assert {'type': 'json'}
import credentialTemplate from './credentialtemplate.json' assert { type: "json" }
import presentationTemplate from './presentationTemplate.json' assert { type: "json" }
import auth from './auth.js'

// override config file with environment variables
for (const param in config) {
  if (process.env[param] !== undefined) {
    config[param] = process.env[param]
  }
}

const auth_token = await auth()
const apiHeaders = {
  'Accept': 'application/json',
  'Authorization': auth_token,
  // 'X-Access-Token': config.api_key,
  'Content-Type': 'application/json'
}

const templates = {}
templates.issue = await createIssuanceTemplate(),
templates.verify = await createVerificationTemplate()
// console.log(JSON.stringify(templates, null, 1))

export { config, apiHeaders, templates }

async function createIssuanceTemplate() {
  const headers = apiHeaders
  const getUrl =  `${config.api_base}/v1/credential-templates`
  // console.log(getUrl, headers)
  const resp = await fetch(getUrl, { headers })
  if (resp.status != 200) {
    console.error(resp.status, getUrl)
    console.log(headers)
    console.log(await resp.text())
    return false
  }
  // console.log(await resp.text())
  const json = await resp.json()
  // console.log(json)
  if (json.content) {
    for (const tmpl of json.content) {
      // console.log(tmpl)
      if (tmpl.templateName == credentialTemplate.templateName) {
        const delUrl =  `${config.api_base}/v1/credential-templates/${tmpl.templateId}`
        await fetch(delUrl, { method: 'DELETE', headers })
        return tmpl
      }
    }
  }
  const createUrl =  `${config.api_base}/v1/credential-templates`
  const body = JSON.stringify(credentialTemplate)
  const createResp = await fetch(createUrl, { method: 'POST', headers, body })
  const createJson = await createResp.json()
  if (createResp.status != 200) {
    console.error(createResp.status, createUrl)
    console.log(await createResp.text())
    return false
  }
  return createJson  
}

async function createVerificationTemplate() {
  const headers = apiHeaders
  const getUrl =  `${config.api_base}/v1/presentation-templates`
  const resp = await fetch(getUrl, { headers })
  const json = await resp.json()
  if (json.content) {
    for (const tmpl of json.content) {
      if (tmpl.presentationTemplateName == presentationTemplate.presentationTemplateName) {
        // console.log(tmpl)
        // const delUrl =  `${config.api_base}/v1/presentation-templates/${tmpl.presentationTemplateId}`
        // const resp = await fetch(delUrl, { method: 'DELETE', headers })
        return tmpl
      }
    }
  }
  const createUrl =  `${config.api_base}/v1/presentation-templates`
  const body = JSON.stringify(presentationTemplate)
  console.log(createUrl, headers, body)
  const createResp = await fetch(createUrl, { method: 'POST', headers, body })
  if (createResp.status != 200) {
    console.error(createResp.status, createUrl)
    console.log(await createResp.text())
    return false
  }
  const createJson = await createResp.json()
  return createJson  
}
  