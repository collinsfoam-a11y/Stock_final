import requests
import xml.etree.ElementTree as ET
import pandas as pd
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")

def fetch_tally_suppliers():
    url = 'http://192.168.1.8:9000/'
    headers = {'Content-Type': 'text/xml'}
    
    xml_data = """<ENVELOPE>
      <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
      </HEADER>
      <BODY>
        <EXPORTDATA>
          <REQUESTDESC>
            <STATICVARIABLES>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
              <TDLMESSAGE>
                <COLLECTION NAME="CustomLedgerExport" ISINITIALIZE="Yes">
                  <TYPE>Ledger</TYPE>
                  <FETCH>Name,Parent,LEDSTATE,LEDMAILINGDETAILS.*,LEDGSTREGDETAILS.*,Email,LedgerPhone,LedgerMobile</FETCH>
                </COLLECTION>
              </TDLMESSAGE>
            </TDL>
            <REPORTNAME>CustomLedgerExport</REPORTNAME>
          </REQUESTDESC>
        </EXPORTDATA>
      </BODY>
    </ENVELOPE>"""
    
    try:
        logging.info("Sending request to Tally...")
        response = requests.post(url, data=xml_data, headers=headers, timeout=30)
        
        if response.status_code == 200:
            logging.info("Parsing XML response...")
            root = ET.fromstring(response.content)
            ledgers = root.findall('.//LEDGER')
            logging.info(f"Found {len(ledgers)} total ledgers.")
            
            suppliers = []
            for ledger in ledgers:
                parent_elem = ledger.find('PARENT')
                parent = parent_elem.text if parent_elem is not None else ""
                
                # Check if it's a Sundry Creditor
                if "Sundry Creditors" in parent:
                    name = ledger.get('NAME')
                    
                    email_elem = ledger.find('EMAIL')
                    email = email_elem.text if email_elem is not None else ""
                    
                    phone_elem = ledger.find('LEDGERPHONE')
                    phone = phone_elem.text if phone_elem is not None else ""
                    
                    state_elem = ledger.find('LEDSTATE')
                    state = state_elem.text if state_elem is not None else ""
                    
                    gstin_elem = ledger.find('.//PARTYGSTIN')
                    gstin = gstin_elem.text if gstin_elem is not None else ""
                    
                    suppliers.append({
                        "Supplier Name": name,
                        "Supplier Group": parent,
                        "Supplier Type": "Company",
                        "Email Address": email,
                        "Phone": phone,
                        "State": state,
                        "GSTIN": gstin
                    })
            
            logging.info(f"Extracted {len(suppliers)} suppliers.")
            
            if suppliers:
                df = pd.DataFrame(suppliers)
                df.to_excel("tally_suppliers.xlsx", index=False)
                logging.info("Successfully exported to tally_suppliers.xlsx")
            else:
                logging.warning("No suppliers found under 'Sundry Creditors'.")
        else:
            logging.error(f"Error {response.status_code}: {response.text}")
    except Exception as e:
        logging.error(f"Failed to fetch from Tally: {e}")

if __name__ == "__main__":
    fetch_tally_suppliers()
