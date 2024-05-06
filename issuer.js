import { createServer } from 'node:http'
import { apiHeaders, config, templates } from './init.js'
import auth from './auth.js'

// console.log(apiHeaders, config, templates)

const VALIDITY_MS = 3 * 365 * 24 * 60 * 60 * 1000 // credential validity time in milliseconds

async function getOffer(path) {
  const { default: credential } = await import('.' + path, { assert: { type: "json" } });
  // console.log(credential)
  const headers = apiHeaders
  const issueUrl =  `${config.api_base}/v1/issuance-sessions`
  const credentialOffer = {
    credentialTemplateId: templates['issue'].templateId,
    revocable: false,
    holderBinding: false,
    validFrom: new Date().toISOString(),
    validUntil: new Date(new Date().getTime() + VALIDITY_MS).toISOString(),
    claims: [
      {
        claimName: "endDate",
        claimValue: credential.credentialSubject.Pension.endDate || ""
      },
      {
        claimName: "startDate",
        claimValue: credential.credentialSubject.Pension.startDate
      },
      {
        claimName: "provisional",
        claimValue: credential.credentialSubject.Pension.provisional || ""
      },
      {
        claimName: "typeCode",
        claimValue: credential.credentialSubject.Pension.typeCode
      },
      {
        claimName: "typeName",
        claimValue: credential.credentialSubject.Pension.typeName
      },
      {
        claimName: "person_identifier_code",
        claimValue: credential.credentialSubject.Person.person_identifier_code
      },
      {
        claimName: "birth_date",
        claimValue: credential.credentialSubject.Person.birth_date
      },
      {
        claimName: "given_name_national_characters",
        claimValue: credential.credentialSubject.Person.given_name_national_characters
      },
      {
        claimName: "family_name_national_characters",
        claimValue: credential.credentialSubject.Person.family_name_national_characters
      },
    ]
  }
  // console.log(JSON.stringify(credentialOffer, null, 2))
  const body = JSON.stringify(credentialOffer)
  const resp = await fetch(issueUrl, { method: 'POST', headers, body })
  if (resp.status == 401) {
    // refresh auth token
    const auth_token = await auth()
    if (!auth_token) {
      throw new Error('Auth token refresh failed!')
    }
    apiHeaders.Authorization = auth_token
    console.log(`refreshed auth token: ${apiHeaders.Authorization}`)
    return getOffer() // recursion; possible infinite loop!
  }
  if (resp.status != 200) {
    console.log(resp.status, issueUrl, headers, body)
    throw new Error(JSON.stringify(await resp.json(), null, 2))
  }
  const json = await resp.json()
  // console.log(json)
  return json
}

const sendOffer = async function (req, res) {
  const path = new URL(`http://${config.server_host}${req.url}`).pathname
  console.log(path)
  if (path.includes('.json')) {
    try {
      const offer = await getOffer(path)
      // console.log(offer)
      res.setHeader("Content-Type", "application/json")
      res.writeHead(200)
      res.end(JSON.stringify(offer))
      return false
    }
    catch(e) {
      console.error(e)
      res.setHeader("Content-Type", "text/plain")
      res.writeHead(404)
      res.end(`${path} not found!`)
      return false  
    }
  }
  else if (path !== '/') {
    res.setHeader("Content-Type", "text/plain")
    res.writeHead(404)
    res.end(`Not Found`)
    return false
  }
  res.setHeader("Content-Type", "text/html")
  res.writeHead(200)
  res.end(`<!DOCTYPE html>
<html>
 <meta charset="UTF-8">
 <title>Lissi myöntää eläketodisteen</title>
 <script src="https://unpkg.com/@qrcode-js/browser"></script>
 <style>
  #qrcode {
    margin: 1em auto;
  }
 </style>
 <body style="text-align: center;">
  <img src="https://upload.wikimedia.org/wikipedia/en/thumb/6/67/Kela_suomi_kela-1-.jpg/220px-Kela_suomi_kela-1-.jpg" alt="Kela" />
  <h1>Heippa asiakas!</h1>
  <p id="instructions">Tunnistaudu palveluun valitsemalla henkilöllisyytesi valintalistasta:</p>
  <form id="idSelector">
   <select name="identity">
   <option value="pensioncredential.json">Totti Aalto (KAEL)</option>
   <option value="pensioncredential-provisional.json">Edwin Kelimtes (väliaikainen TKEL)</option>
   <option value="pensioncredential-disability.json">Joni Kai Hiltunen (TKEL)</option>
   <option value="pensioncredential-rehabilitation.json">Jonne Aapeli Setälä (KUKI)</option>
   <option value="pensioncredential-rehabilitation-expired.json">Annina von Forsellestes (päättynyt KUKI)</option>
   </select>
   <input type="submit" value="Vahvista" />
  </form>
  <canvas id="qrcode"></canvas>
  <p id="offer">Valmistellaan...</p>
  <script>

   const a = document.createElement('a')
   a.textContent = 'Kopioi todistetarjous leikepöydälle.'
   const o = document.querySelector('#offer')

   const f = document.querySelector('#idSelector')
   f.onsubmit = async function(e) {
    e.preventDefault()
    const file = this.identity.value
    // console.log(file)
    const resp = await fetch(file)
    if (resp.status != 200) {
      console.error(await resp.text())
      return false
    }
    const offer = await resp.json()
    let qrUrl = offer.credentialOfferDetails.credentialOfferUri
    const otp = offer.credentialOfferDetails.oneTimePassword
    const canvas = document.getElementById("qrcode")
    const qr = QRCode.QRCodeBrowser(canvas)
    qr.setOptions({
      text: qrUrl,
      size: 256,
    })
    qr.draw()
    let msg = 'Skannaapa oheinen QR-koodi digikukkarollasi niin laitetaan sinne eläketodiste tulemaan.'
    msg += \` Kun lompakkosi kysyy nelinumeroista koodia, syötä numerot <strong>\${otp}</strong>!\`
    document.querySelector('#instructions').innerHTML = msg    
    a.href = qrUrl
    a.onclick = function(e) {
     e.preventDefault()
     console.log(this.href)
     try {
      navigator.clipboard.writeText(this.href)
     } catch (error) {
      console.error(error.message)
     }
    }
    document.querySelector('#qrcode').onclick = () => {document.location.href = qrUrl}
    o.textContent = ''
    o.appendChild(a)
   }
  </script>
 </body>
</html>`)
}

const server = createServer(sendOffer)
server.listen(config.issuer_port, config.server_host, () => {
  console.log(`Server is running on http://${config.server_host}:${config.issuer_port}`)
})
