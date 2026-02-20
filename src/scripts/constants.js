// Message types
export const MESSAGE_TYPE_AUTOMATION = "GRAPHAMELEON_AUTOMATION";

// Automation commands sent between the page, content script and background script
export const COMMANDS = {
    SET_PARAMS: "setParams",
    START: "start",
    STOP: "stop",
    EXPORT: "export",
    RESET: "reset",
    GET_STATUS: "getStatus",
    GET_DATA: "getData",
};

// Export/data formats
export const FORMAT_N3 = "n3";
export const FORMAT_TTL = "ttl";
export const FORMAT_JSON = "json";
export const FORMAT_CSV = "csv";
