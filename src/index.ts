import got from "got";
import { decode } from "he";
import { load } from "cheerio";

import { DDGSOptions, DDGSResult, DDGSTextOptions } from "./types";
import { Logger } from "./logger";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const REGEX_500_IN_URL = /[0-9]{3}-[0-9]{2}.js/;
const REGEX_STRIP_TAGS = /<.*?>/g;

const USERAGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
] as const;

export class DDGS {
    // DuckDuckgo Search class to get search results from duckduckgo.com

    private _client: got.GotInstance<got.GotBodyFn<string>>;
    public logger = new Logger();
    /**
     *
     * @param options DDGS Options. timeout must be millseconds
     */
    constructor(options: DDGSOptions = {}) {
        const headers = options?.headers || {
            "User-Agent": USERAGENTS[Math.floor(Math.random() * USERAGENTS.length)],
            Referer: "https://duckduckgo.com/",
        };
        this._client = got.extend({
            headers,
            timeout: {
                request: options?.timeout || 10000,
            },
            retry: {
                // @ts-expect-error Why
                limit: 0,
            },
            throwHttpErrors: false,
        });
    }
    /**
     * something like '506-00.js' inside the url
     * @param url The URL.
     * @returns
     */
    private _is500InUrl(url: string): boolean {
        return REGEX_500_IN_URL.test(url);
    }
    private async _getUrl(
        method: string,
        url: string,
        gotOptions?: got.GotBodyOptions<string>
    ) {
        for (let i = 0; i < 3; i++) {
            try {
                const resp = await this._client(url, {
                    method,
                    followRedirect: true,
                    throwHttpErrors: true,
                    ...gotOptions,
                });
                if (this._is500InUrl(resp.url) || resp.statusCode === 202) {
                    throw new got.HTTPError("");
                }
                if (resp.statusCode === 200) {
                    return resp;
                }
            } catch (e: unknown) {
                this.logger.warn(`_getUrl() ${url} ${e}`);
                if (i >= 2 || String(e).includes("418")) throw e;
            }
            await sleep(3000);
        }
        return null;
    }
    /**
     * Get vqd value for a search query.
     * @param keywords
     */
    private async _getVqd(keywords: string) {
        const resp = await this._getUrl("POST", "https://duckduckgo.com", {
            body: new URLSearchParams({
                q: keywords,
            }).toString(),
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
        });
        if (resp) {
            const respContent: Buffer = Buffer.from(resp.body, "utf8");

            const pairs: [Buffer, Buffer][] = [
                [Buffer.from('vqd="', "utf8"), Buffer.from('"', "utf8")],
                [Buffer.from("vqd=", "utf8"), Buffer.from("&", "utf8")],
                [Buffer.from("vqd='", "utf8"), Buffer.from("'", "utf8")],
            ];

            for (const [c1, c2] of pairs) {
                try {
                    const start: number = respContent.indexOf(c1) + c1.length;
                    const end: number = respContent.indexOf(c2, start);
                    return respContent.subarray(start, end).toString();
                } catch (e) {
                    this.logger.warn(`_get_vqd() keywords=${keywords} vqd not found`);
                }
            }
        }
        return null;
    }
    /**
     * strip HTML tags.
     * @param rawHtml The raw HTML string.
     */
    private _normalize(rawHtml: string) {
        return rawHtml ? decode(rawHtml.replace(REGEX_STRIP_TAGS, "")) : "";
    }
    /**
     * unquote url and replace spaces with '+'
     * @param url The url
     */
    private _normalizeUrl(url: string) {
        return url ? decodeURIComponent(url).replace(/ /g, "+") : "";
    }
    /**
     * DuckDuckGo text search generator.
     * @see https://duckduckgo.com/params
     * @param keywords keywords for query.
     * @param options options.
     */
    public async text(
        keywords: string,
        options: DDGSTextOptions = {}
    ): Promise<DDGSResult[]> {
        options.region ??= "wt-wt";
        options.safesearch ??= "moderate";
        options.backend ??= "api";
        options.timelimit ??= "none";
        if (options.backend === "api") {
            return await this._textApi(
                keywords,
                options as Required<DDGSTextOptions>
            );
        } else if (options.backend === "html") {
            return await this._textHtml(
                keywords,
                options as Required<DDGSTextOptions>
            );
        } else if (options.backend === "lite") {
            throw new Error("Lite not implemented! use api or html.");
        } else {
            throw new Error("Unknown backend option passed");
        }
    }
    private async _textApi(keywords: string, options: Required<DDGSTextOptions>) {
        if (!keywords) throw new Error("keywords is mandatory");
        const vqd = await this._getVqd(keywords);
        if (!vqd) throw new Error("Error in getting vqd");

        const payload = {
            q: keywords,
            kl: options.region,
            l: options.region,
            s: "0",
            df: options.timelimit === "none" ? undefined : options.timelimit,
            vqd,
            o: "json",
            ex:
                options.safesearch === "off"
                    ? "-2"
                    : options.safesearch === "moderate"
                        ? "-1"
                        : undefined,
            p:
                options.safesearch === "moderate"
                    ? ""
                    : options.safesearch === "on"
                        ? "1"
                        : undefined,
            sp: options.safesearch === "off" ? undefined : "0",
        };

        const cache = new Set<string>();
        const results: Array<DDGSResult> = [];
        for (const s of ["0", "20", "70", "120"]) {
            payload.s = s;
            const resp = await this._getUrl(
                "GET",
                "https://links.duckduckgo.com/d.js?" +
                new URLSearchParams(payload as Record<string, string>).toString()
            );
            if (resp === null) break;
            let pageData;
            try {
                pageData = JSON.parse(resp.body).results || null;
            } catch {
                break;
            }
            if (pageData === null) {
                break;
            }
            let resultExists = false;
            for (const row of pageData) {
                const href = row.u || null;
                if (
                    href &&
                    !cache.has(href) &&
                    href !== `http://www.google.com/search?q=${keywords}`
                ) {
                    cache.add(href);
                    const body = this._normalize(row.a);
                    if (body) {
                        resultExists = true;
                        results.push({
                            title: this._normalize(row.t),
                            href: this._normalizeUrl(href),
                            body: body,
                        });
                    }
                }
            }
            if (resultExists === false) break;
        }
        return results;
    }
    private async _textHtml(
        keywords: string,
        options: Required<DDGSTextOptions>
    ): Promise<DDGSResult[]> {
        if (!keywords) throw new Error("keywords is mandatory");

        const safesearchBase = {
            on: "1",
            moderate: "-1",
            off: "-2",
        } as const;
        let payload: Record<string, string | undefined> = {
            q: keywords,
            kl: options.region,
            p: safesearchBase[options.safesearch],
            df: options.timelimit === "none" ? undefined : options.timelimit,
        };
        const cache = new Set<string>();
        const results: DDGSResult[] = [];
        for (let i = 0; i < 10; i++) {
            const resp = await this._getUrl(
                "POST",
                "https://html.duckduckgo.com/html",
                {
                    body: new URLSearchParams(
                        payload as Record<string, string>
                    ).toString(),
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                }
            );
            if (!resp?.body) break;
            const $ = load(resp.body);
            if ($("div.no-results").length) {
                this.logger.warn("No results");
                return [];
            }
            let resultExists = false;
            $("div.results_links").each(function () {
                const a = $(this).find("a.result__a");
                const snippet = $(this).find("a.result__snippet");
                if (!a.length) return;
                const href = a.attr("href");
                if (
                    href &&
                    !cache.has(href) &&
                    href !== `http://www.google.com/search?q=${keywords}`
                ) {
                    cache.add(href);
                    resultExists = true;
                    results.push({
                        title: a.text().trim(),
                        body: snippet.text().trim(),
                        href,
                    });
                    return;
                }
            });
            const nextPageApi = $("div.nav-link");
            const nextPage = nextPageApi.length ? nextPageApi.first() : null;
            if (nextPage === null || !resultExists) {
                break;
            }
            const result: Record<string, string> = {};
            nextPage.find("input[type='hidden']").each(function () {
                result[$(this).attr("name")!] = $(this).attr("value")!;
            });
            payload = result;
            await sleep(750);
        }
        return results;
    }
    /*
    private async _textLite(
        keywords: string,
        options: Required<DDGSTextOptions>
    ) {
        if (!keywords) throw new Error("keywords is mandatory");
        const payload: Record<string, string | undefined> = {
            q: keywords,
            kl: options.region,
            df: options.timelimit === "none" ? undefined : options.timelimit,
        }
        const cache = new Set<string>();
        for (const s of ["0", "20", "70", "120"]) {
            payload["s"] = s;
            const resp = await this._getUrl("POST", "https://lite.duckduckgo.com/lite/", {
                body: new URLSearchParams(payload as Record<string, string>).toString(),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            });
            if (!resp?.body) break;
            if (resp.body.includes("No more results.")) {
                break;
            }
            const $ = load(resp.body);
            let resultExists = false;

        }
    }
    */
}

export * from "./types";
