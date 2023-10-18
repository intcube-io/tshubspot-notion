import { Client as NotionClient } from "@notionhq/client";
import { Client as HubspotClient } from "@hubspot/api-client";

import dotenv from "dotenv";

dotenv.config();

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

  const notionProjectDb = await notion.databases.query({
    database_id: notionProjectDbId,
  });
  console.log("Got response:", notionProjectDb);

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
