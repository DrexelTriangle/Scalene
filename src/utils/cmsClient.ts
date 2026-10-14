// The site's one CmsClient, configured from the environment. Shared so that
// concurrent identical reads from anywhere in the process can be deduplicated
// against each other; see cmsFetch.ts.

import { createCmsClient } from './cmsFetch.ts';
import { recordCmsTiming } from './cmsTiming.ts';

const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? "https://localhost:8080/v1";

export const cms = createCmsClient({ baseUrl: cmsBaseUrl, onTiming: recordCmsTiming });
