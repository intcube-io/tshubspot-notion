import { Client as NotionClient } from "@notionhq/client";
import { Client as HubspotClient } from "@hubspot/api-client";
import * as _ from "lodash";

import dotenv from "dotenv";
import { assert } from "console";
import { partitionMap } from "fp-ts/Array";
import { difference } from "fp-ts/Set";
import { Either, left, right } from 'fp-ts/Either'
import * as S from 'fp-ts/string'
import { SimplePublicObjectWithAssociations } from "@hubspot/api-client/lib/codegen/crm/companies";

dotenv.config();

// https://app.hubspot.com/contacts/{PORTAL_ID}/record/0-3/9162434779
function hubspotDealIdToURL(portalId: string, dealId: string): string {
  // prettier-ignore
  assert(/^[0-9]+$/.test(portalId), "hubspotDealIdToURL: invalid portalId: " + portalId);
  // prettier-ignore
  assert(/^[0-9]+$/.test(dealId)), "hubspotDealIdToURL: invalid dealId: " + dealId;

  const url = dealId.replace(
    /([0-9]+)/g,
    "https://app.hubspot.com/contacts/" + portalId + "/record/0-3/$1",
  );
  return url;
}

function hubspotUrlToId(portalId: string, url: string): string {
  // prettier-ignore
  assert(/^[0-9]+$/.test(portalId), "hubspotDealIdToURL: invalid portalId: " + portalId);

  const dealId = url.replace(
    /^https:\/\/app.hubspot.com\/contacts\/[0-9]+\/record\/0-3\/([0-9]+$)/g,
    "$1",
  );
  const _portalId = url.replace(
    /^https:\/\/app.hubspot.com\/contacts\/([0-9]+)\/record\/0-3\/[0-9]+$/g,
    "$1",
  );
  // prettier-ignore
  assert(portalId === _portalId, "hubspotDealIdToURL: portalId from URL '" + portalId + "'doesn't match expected portalId'" + _portalId + "'");
  // prettier-ignore
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

  console.log("Querying Notion project DB rows.");
  const notionProjectDb = await notion.databases.query({
    database_id: notionProjectDbId,
  });

  console.log("Getting all Hubspot deals.");
  const allDeals = await hubspot.crm.deals.getAll();

  console.log("Ensuring/updating Notion DB schema.");
  /* This is mostly a sanity check -- we don't keep track of the DB schema but override it
   * with the data from Hubspot on each sync.  But the info can be useful for debugging :-) */
  let dbSchemaUpToDate = true;
  const currentProjectDbSchema = await notion.databases.retrieve({database_id: notionProjectDbId});
  const databaseKeys = new Set(Object.keys(currentProjectDbSchema.properties));
  const hubspotProperties = new Set(Object.keys(allDeals[0].properties));
  /* This is already checked below but we'll still special-case this as this should only be true on first run! */
  if (!(databaseKeys.has("Name")) || !(databaseKeys.has("hubspot_deal_id"))) {
    dbSchemaUpToDate = false;
    console.log("Keys 'Name' or 'hubspot_deal_id' missing in Notion DB -- first run?");
  }
  const deletedDatabaseKeys = difference(S.Eq)(hubspotProperties.add("Name").add("hubspot_deal_id"))(databaseKeys);
  const newDatabaseKeys = difference(S.Eq)(databaseKeys)(hubspotProperties);
  console.log("New properties from Hubspot:", newDatabaseKeys);
  console.log("Deleted properties from Hubspot:", deletedDatabaseKeys);
  dbSchemaUpToDate = dbSchemaUpToDate && newDatabaseKeys.size === 0 && deletedDatabaseKeys.size === 0;
  
  if (!dbSchemaUpToDate) {
    const notionProjectDbSchema = await notion.databases.update({
      database_id: notionProjectDbId,
      properties: {
        Name: {
          title: {},
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
      },
    });
  }


  console.log("Matching existing Notion DB entries to Hubspot deals.");
  let mapDealToPage: { [id: string]: string } = {};
  for (let dealPage of notionProjectDb.results) {
    // prettier-ignore
    assert(dealPage.object === "page", "notionProjectdb object '" + dealPage.id + "' isn't a page: " + dealPage.object);

    // hubspot_deal_id: { id: 'url', url: 'https://the.url' }
    if (
      !("properties" in dealPage) ||
      !("hubspot_deal_id" in dealPage.properties) ||
      !(dealPage.properties.hubspot_deal_id.type === "url") ||
      !(typeof dealPage.properties.hubspot_deal_id.url === "string")
    ) {
      console.log(
        "Page",
        dealPage.id,
        "has no readable & valid `hubspot_deal_id` URL property; archiving",
      );
      await notion.pages.update({
        page_id: dealPage.id,
        archived: true,
      });
      continue;
    }
    const dealId = hubspotUrlToId(
      HUBSPOT_PORTAL_ID,
      dealPage.properties.hubspot_deal_id.url,
    );
    mapDealToPage[dealId] = dealPage.id;
  }

  console.log("Updating/creating Notion DB entries from Hubspot deals.");
  // We use fp-ts' partitionMap which is equivalent to Haskell's partitionWith:
  //
  //     getPageOrDealId = if (hasPage deal) then Left (deal, getPage deal) else Right deal
  //     (pagesToUpdate, pagesToCreate) = partitionWith (getPageOrDealId) allDeals
  //
  // This leverages the power of Monads to linearly iterate through the list, partitioning it,
  // and also appending the pageId, if available.
  //
  // A call to partitionMap with the supplied partitioning function yields a new function which can
  // be applied on its argument (the list/array), which makes for some unusual TypeScript syntax:
  //
  //     results = partitionMap(fn)(array);
  //
  // Perhaps more plainly:
  //
  //     applicator = partitionMap(fn);
  //     results = applicator(array);
  //
  const {left: pagesToUpdate, right: pagesToCreate}: {
    left: { deal: SimplePublicObjectWithAssociations; pageId: string }[], /* with additional pageId */
    right: { deal: SimplePublicObjectWithAssociations }[],
  } = partitionMap((deal: SimplePublicObjectWithAssociations) => {
    const pageId = mapDealToPage[deal.id];
    return pageId ? left({deal: deal, pageId: pageId}) : right({deal: deal});
  })(allDeals);

  const OPERATION_BATCH_SIZE = 10;
  const pagesToUpdateChunked = _.chunk(pagesToUpdate, OPERATION_BATCH_SIZE);
  for (let pageBatch of pagesToUpdateChunked) {
    await Promise.all(
      pageBatch.map((page) => {
        /* TODO: how to use this below? */
        const the_properties = {
          Name: {
            title: [
              {
                text: {
                  content: page.deal.properties.dealname!,
                },
              },
            ],
          },
          hubspot_deal_id: {
            type: "url",
            url: hubspotDealIdToURL(HUBSPOT_PORTAL_ID, page.deal.id),
          },
        };

        console.log("Updating deal", page.deal.id);
        return notion.pages.update({
          page_id: page.pageId,
          properties: {
            Name: {
              title: [
                {
                  text: {
                    content: page.deal.properties.dealname!,
                  },
                },
              ],
            },
            hubspot_deal_id: {
              type: "url",
              url: hubspotDealIdToURL(HUBSPOT_PORTAL_ID, page.deal.id),
            },
          },
        });
      }),
    );
  }

  const pagesToCreateChunked = _.chunk(pagesToCreate, OPERATION_BATCH_SIZE);
  for (let pageBatch of pagesToCreateChunked) {
    await Promise.all(
      pageBatch.map((page) => {
        console.log("Creating deal", page.deal.id);
        return notion.pages.create({
          parent: {
            type: "database_id",
            database_id: notionProjectDbId,
          },
          properties: {
            Name: {
              title: [
                {
                  text: {
                    content: page.deal.properties.dealname!,
                  },
                },
              ],
            },
            hubspot_deal_id: {
              type: "url",
              url: hubspotDealIdToURL(HUBSPOT_PORTAL_ID, page.deal.id),
            },
          },
        });
      }),
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
