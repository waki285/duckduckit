export interface DDGSOptions {
    headers?: Record<string, string>;
    timeout?: number;
}

export interface DDGSTextOptions {
    /**
     * wt-wt, us-en, uk-en, ru-ru, etc. Defaults to "wt-wt".
     */
    region?: string;
    /**
     * on, moderate, off. Defaults to "moderate".
     */
    safesearch?: "on" | "moderate" | "off";
    /**
     * d, w, m, y. Defaults to none.
     */
    timelimit?: "d" | "w" | "m" | "y" | "none";
    /**
     * api, html, lite. Defaults to api.
     * - api - collect data from https://duckduckgo.com
     * - html - collect data from https://html.duckduckgo.com
     * - lite - collect data from https://lite.duckduckgo.com
     */
    backend?: "api" | "html" | "lite";

}

export interface DDGSResult {
    title: string;
    href: string;
    body: string;
}