import { Client as NotionClient } from "@notionhq/client";
import { Client as HubspotClient } from "@hubspot/api-client";

import dotenv from "dotenv";
import { assert } from "console";

dotenv.config();

// https://app.hubspot.com/contacts/{PORTAL_ID}/record/0-3/9162434779
function hubspotDealIdToURL(portalId: string, dealId: string): string {
  assert(/^[0-9]+$/.test(portalId), "hubspotDealIdToURL: invalid portalId: " + portalId);
  assert(/^[0-9]+$/.test(dealId)), "hubspotDealIdToURL: invalid dealId: " + dealId;

  const url = dealId.replace(
    /([0-9]+)/g,
    "https://app.hubspot.com/contacts/" + portalId + "/record/0-3/$1"
  );
  return url;
}

function hubspotUrlToId(portalId: string, url: string): string {
  assert(/^[0-9]+$/.test(portalId), "hubspotDealIdToURL: invalid portalId: " + portalId);

  const dealId = url.replace(
    /^https:\/\/app.hubspot.com\/contacts\/[0-9]+\/record\/0-3\/([0-9]+$)/g,
    "$1"
  );
  const _portalId = url.replace(
    /^https:\/\/app.hubspot.com\/contacts\/([0-9]+)\/record\/0-3\/[0-9]+$/g,
    "$1"
  );
  assert(portalId === _portalId, "hubspotDealIdToURL: portalId from URL '"+portalId+"'doesn't match expected portalId'"+_portalId+"'");
  assert(/^[0-9]+$/.test(dealId), "hubspotDealIdToURL: invalid dealId: " + dealId);

  return dealId;
}

async function main() {
  const notion = new NotionClient({
    auth: process.env.NOTION_TOKEN,
  });
  const hubspot = new HubspotClient({
    accessToken: process.env.HUBSPOT_API_KEY,
  });

  const notionProjectDbId = process.env.NOTION_INTCUBE_PROJECT_DB!;

  console.log('Ensuring/updating Notion DB schema.')
  const notionProjectDbSchema = await notion.databases.update({
    database_id: notionProjectDbId,
    properties: {
      Name: {
        title: {}
      },
      /* Uses type Record<string, url-property>, where the key in the record
       * must match the `name` in the url-property, otherwise this will be read
       * as an "update name" request, updating any property matched by the key
       * in the record to have the new name indicated by `name`.
       */
      hubspot_deal_id: {
        type: "url",
        name: "hubspot_deal_id",
        url: {},
      },
    }
  });

  console.log('Querying Notion project DB rows.')
  const notionProjectDb = await notion.databases.query({
    database_id: notionProjectDbId,
  });

  const allDeals = await hubspot.crm.deals.getAll();
  for (let deal of allDeals) {
    console.log(deal);
    const r = await notion.pages.create({
      parent: {
        type: "database_id",
        database_id: notionProjectDbId,
      },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: deal.properties.dealname!,
              },
            },
          ],
        },
      },
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
