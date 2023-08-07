type LogMethod = "log" | "warn" | "error";

export class Logger {
    private _logLevel = -1;
    public get logLevel() {
        return this._logLevel;
    }
    /**
     * 
     * @param logLevel Log Level. less than 0 is silent.
     */
    public setLogLevel(logLevel: number) {
        this._logLevel = logLevel;
    }
    private _log(method: LogMethod, ...message: unknown[]) {
        if (Math.sign(this.logLevel) === -1) return;
        console[method](...message);
    }
    public log(...message: unknown[]) {
        this._log("log", ...message);
    }
    public warn(...message: unknown[]) {
        this._log("warn", ...message);
    }
    public error(...message: unknown[]) {
        this._log("error", ...message);
    }
}