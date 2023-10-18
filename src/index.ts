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
  const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID!;

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

  console.log('Getting all Hubspot deals.')
  const allDeals = await hubspot.crm.deals.getAll();

  console.log('Matching existing Notion DB entries to Hubspot deals.')
  let mapDealToPage: { [id: string]: string } = {};
  for (let dealPage of notionProjectDb.results) {
    assert(dealPage.object === "page", "notionProjectdb object '"+dealPage.id+"' isn't a page: "+dealPage.object);

    // hubspot_deal_id: { id: 'url', url: 'https://the.url' }
    if (
      !("properties" in dealPage) ||
      !("hubspot_deal_id" in dealPage.properties) ||
      !(dealPage.properties.hubspot_deal_id.type === "url") ||
      !dealPage.properties.hubspot_deal_id.url
    ) {
      console.log(
        "Page",
        dealPage.id,
        "has no readable & valid `hubspot_deal_id` URL property; archiving"
      );
      await notion.pages.update({
        page_id: dealPage.id,
        archived: true,
      });
      continue;
    }
    const dealId = hubspotUrlToId(
      HUBSPOT_PORTAL_ID,
      dealPage.properties.hubspot_deal_id.url
    );
    mapDealToPage[dealId] = dealPage.id;
  }

  console.log('Updating/creating Notion DB entries from Hubspot deals.')
  for (let deal of allDeals) {
    const page = mapDealToPage[deal.id];
    /* TODO: how to use this below? */
    const the_properties = {
      Name: {
        title: [
          {
            text: {
              content: deal.properties.dealname!,
            },
          },
        ],
      },
      hubspot_deal_id: {
        type: "url",
        url: hubspotDealIdToURL(HUBSPOT_PORTAL_ID, deal.id),
      },
    };

    if (page) {
      console.log('Updating deal', deal.id)
      const r = await notion.pages.update({
        page_id: page,
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
          hubspot_deal_id: {
            type: "url",
            url: hubspotDealIdToURL(HUBSPOT_PORTAL_ID, deal.id),
          },
        },
      });
    } else {
      console.log('Creating deal', deal.id)
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
          hubspot_deal_id: {
            type: "url",
            url: hubspotDealIdToURL(HUBSPOT_PORTAL_ID, deal.id),
          },
        },
      });
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
