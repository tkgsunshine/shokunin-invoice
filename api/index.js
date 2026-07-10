// node_modules/hono/dist/compose.js
var compose = (middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler2;
      if (middleware[i]) {
        handler2 = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler2 = i === middleware.length && next || void 0;
      }
      if (handler2) {
        try {
          res = await handler2(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
  };
};

// node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// node_modules/hono/dist/utils/body.js
var parseBody = async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
};
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
var handleParsingAllValues = (form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
};
var handleParsingNestedValues = (form, key, value) => {
  if (/(?:^|\.)__proto__\./.test(key)) {
    return;
  }
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
};

// node_modules/hono/dist/utils/url.js
var splitPath = (path2) => {
  const paths = path2.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
};
var splitRoutingPath = (routePath) => {
  const { groups, path: path2 } = extractGroupsFromPath(routePath);
  const paths = splitPath(path2);
  return replaceGroupMarks(paths, groups);
};
var extractGroupsFromPath = (path2) => {
  const groups = [];
  path2 = path2.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path: path2 };
};
var replaceGroupMarks = (paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
};
var patternCache = {};
var getPattern = (label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
};
var tryDecode = (str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
};
var tryDecodeURI = (str) => tryDecode(str, decodeURI);
var getPath = (request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path2 = url.slice(start, end);
      return tryDecodeURI(path2.includes("%25") ? path2.replace(/%25/g, "%2525") : path2);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
};
var getPathNoStrict = (request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
};
var mergePath = (base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
};
var checkOptionalParameter = (path2) => {
  if (path2.charCodeAt(path2.length - 1) !== 63 || !path2.includes(":")) {
    return null;
  }
  const segments = path2.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
};
var _decodeURI = (value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
};
var _getQueryParam = (url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
};
var getQueryParam = _getQueryParam;
var getQueryParams = (url, key) => {
  return _getQueryParam(url, key, true);
};
var decodeURIComponent_ = decodeURIComponent;

// node_modules/hono/dist/request.js
var tryDecodeURIComponent = (str) => tryDecode(str, decodeURIComponent_);
var HonoRequest = class {
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path2 = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path2;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return parseBody(this, options);
  }
  #cachedBody = (key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  };
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * `.bytes()` parses the request body as a `Uint8Array`.
   *
   * @see {@link https://hono.dev/docs/api/request#bytes}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.bytes()
   * })
   * ```
   */
  bytes() {
    return this.#cachedBody("arrayBuffer").then((buffer) => new Uint8Array(buffer));
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = (value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
};
var resolveCallback = async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
};

// node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = (contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
};
var createResponseInstance = (body, init) => new Response(body, init);
var Context = class {
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= createResponseInstance(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = createResponseInstance(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = (...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  };
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = (layout) => this.#layout = layout;
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = () => this.#layout;
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = (renderer) => {
    this.#renderer = renderer;
  };
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = (name, value, options) => {
    if (this.finalized) {
      this.#res = createResponseInstance(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  };
  status = (status) => {
    this.#status = status;
  };
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = (key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  };
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = (key) => {
    return this.#var ? this.#var.get(key) : void 0;
  };
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return createResponseInstance(data, { status, headers: responseHeaders });
  }
  newResponse = (...args) => this.#newResponse(...args);
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = (data, arg, headers) => this.#newResponse(data, arg, headers);
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = (text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  };
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = (object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  };
  html = (html, arg, headers) => {
    const res = (html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers));
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  };
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = (location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  };
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = () => {
    this.#notFoundHandler ??= () => createResponseInstance();
    return this.#notFoundHandler(this);
  };
};

// node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
};

// node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// node_modules/hono/dist/hono-base.js
var notFoundHandler = (c) => {
  return c.text("404 Not Found", 404);
};
var errorHandler = (err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
};
var Hono = class _Hono {
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler2) => {
          this.#addRoute(method, this.#path, handler2);
        });
        return this;
      };
    });
    this.on = (method, path2, ...handlers) => {
      for (const p of [path2].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler2) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler2);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler2) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler2);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path2, app2) {
    const subApp = this.basePath(path2);
    app2.routes.map((r) => {
      let handler2;
      if (app2.errorHandler === errorHandler) {
        handler2 = r.handler;
      } else {
        handler2 = async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res;
        handler2[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler2, r.basePath);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path2) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path2);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = (handler2) => {
    this.errorHandler = handler2;
    return this;
  };
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = (handler2) => {
    this.#notFoundHandler = handler2;
    return this;
  };
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path2, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = (request) => request;
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path2);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = this.getPath(request).slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler2 = async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    };
    this.#addRoute(METHOD_NAME_ALL, mergePath(path2, "*"), handler2);
    return this;
  }
  #addRoute(method, path2, handler2, baseRoutePath) {
    method = method.toUpperCase();
    path2 = mergePath(this._basePath, path2);
    const r = {
      basePath: baseRoutePath !== void 0 ? mergePath(this._basePath, baseRoutePath) : this._basePath,
      path: path2,
      method,
      handler: handler2
    };
    this.router.add(method, path2, [handler2, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env, "GET")))();
    }
    const path2 = this.getPath(request, { env });
    const matchResult = this.router.match(method, path2);
    const c = new Context(request, {
      path: path2,
      matchResult,
      env,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = (request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  };
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = (input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  };
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = () => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  };
};

// node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path2) {
  const matchers = this.buildAllMatchers();
  const match2 = ((method2, path22) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path22];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path22.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  });
  this.match = match2;
  return match2(method, path2);
}

// node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
var Node = class _Node {
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path2, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path2 = path2.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path2.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path2) {
  return wildcardRegExpCache[path2] ??= new RegExp(
    path2 === "*" ? "" : `^${path2.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path2, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path2] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path2, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path2) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
function findMiddleware(middleware, path2) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path2)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
var RegExpRouter = class {
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path2, handler2) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path2 === "/*") {
      path2 = "*";
    }
    const paramCount = (path2.match(/\/:/g) || []).length;
    if (/\*$/.test(path2)) {
      const re = buildWildcardRegExp(path2);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path2] ||= findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || [];
        });
      } else {
        middleware[method][path2] ||= findMiddleware(middleware[method], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler2, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler2, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path2) || [path2];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path22 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path22] ||= [
            ...findMiddleware(middleware[m], path22) || findMiddleware(middleware[METHOD_NAME_ALL], path22) || []
          ];
          routes[m][path22].push([handler2, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path2) => [path2, r[method][path2]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path2) => [path2, r[METHOD_NAME_ALL][path2]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path2, handler2) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path2, handler2]);
  }
  match(method, path2) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path2);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var hasChildren = (children) => {
  for (const _ in children) {
    return true;
  }
  return false;
};
var Node2 = class _Node2 {
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler2, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler2) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler: handler2, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path2, handler2) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path2);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler: handler2,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #pushHandlerSets(handlerSets, node, method, nodeParams, params) {
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
  }
  search(method, path2) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path2);
    const curNodesQueue = [];
    const len = parts.length;
    let partOffsets = null;
    for (let i = 0; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              this.#pushHandlerSets(handlerSets, nextNode.#children["*"], method, node.#params);
            }
            this.#pushHandlerSets(handlerSets, nextNode, method, node.#params);
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              this.#pushHandlerSets(handlerSets, astNode, method, node.#params);
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          if (matcher instanceof RegExp) {
            if (partOffsets === null) {
              partOffsets = new Array(len);
              let offset = path2[0] === "/" ? 1 : 0;
              for (let p = 0; p < len; p++) {
                partOffsets[p] = offset;
                offset += parts[p].length + 1;
              }
            }
            const restPathString = path2.substring(partOffsets[i]);
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              this.#pushHandlerSets(handlerSets, child, method, node.#params, params);
              if (hasChildren(child.#children)) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              this.#pushHandlerSets(handlerSets, child, method, params, node.#params);
              if (child.#children["*"]) {
                this.#pushHandlerSets(
                  handlerSets,
                  child.#children["*"],
                  method,
                  params,
                  node.#params
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      const shifted = curNodesQueue.shift();
      curNodes = shifted ? tempNodes.concat(shifted) : tempNodes;
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler: handler2, params }) => [handler2, params])];
  }
};

// node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path2, handler2) {
    const results = checkOptionalParameter(path2);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler2);
      }
      return;
    }
    this.#node.insert(method, path2, handler2);
  }
  match(method, path2) {
    return this.#node.search(method, path2);
  }
};

// node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// node_modules/hono/dist/middleware/cors/index.js
var cors = (options) => {
  const opts = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: [],
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  };
};

// node_modules/hono/dist/utils/cookie.js
var validCookieNameRegEx = /^[\w!#$%&'*.^`|~+-]+$/;
var validCookieValueRegEx = /^[ !#-:<-[\]-~]*$/;
var trimCookieWhitespace = (value) => {
  let start = 0;
  let end = value.length;
  while (start < end) {
    const charCode = value.charCodeAt(start);
    if (charCode !== 32 && charCode !== 9) {
      break;
    }
    start++;
  }
  while (end > start) {
    const charCode = value.charCodeAt(end - 1);
    if (charCode !== 32 && charCode !== 9) {
      break;
    }
    end--;
  }
  return start === 0 && end === value.length ? value : value.slice(start, end);
};
var parse = (cookie, name) => {
  if (name && cookie.indexOf(name) === -1) {
    return {};
  }
  const pairs = cookie.split(";");
  const parsedCookie = /* @__PURE__ */ Object.create(null);
  for (const pairStr of pairs) {
    const valueStartPos = pairStr.indexOf("=");
    if (valueStartPos === -1) {
      continue;
    }
    const cookieName = trimCookieWhitespace(pairStr.substring(0, valueStartPos));
    if (name && name !== cookieName || !validCookieNameRegEx.test(cookieName) || cookieName in parsedCookie) {
      continue;
    }
    let cookieValue = trimCookieWhitespace(pairStr.substring(valueStartPos + 1));
    if (cookieValue.startsWith('"') && cookieValue.endsWith('"')) {
      cookieValue = cookieValue.slice(1, -1);
    }
    if (validCookieValueRegEx.test(cookieValue)) {
      parsedCookie[cookieName] = cookieValue.indexOf("%") !== -1 ? tryDecode(cookieValue, decodeURIComponent_) : cookieValue;
      if (name) {
        break;
      }
    }
  }
  return parsedCookie;
};
var _serialize = (name, value, opt = {}) => {
  if (!validCookieNameRegEx.test(name)) {
    throw new Error("Invalid cookie name");
  }
  let cookie = `${name}=${value}`;
  if (name.startsWith("__Secure-") && !opt.secure) {
    throw new Error("__Secure- Cookie must have Secure attributes");
  }
  if (name.startsWith("__Host-")) {
    if (!opt.secure) {
      throw new Error("__Host- Cookie must have Secure attributes");
    }
    if (opt.path !== "/") {
      throw new Error('__Host- Cookie must have Path attributes with "/"');
    }
    if (opt.domain) {
      throw new Error("__Host- Cookie must not have Domain attributes");
    }
  }
  for (const key of ["domain", "path", "sameSite", "priority"]) {
    if (opt[key] && /[;\r\n]/.test(opt[key])) {
      throw new Error(`${key} must not contain ";", "\\r", or "\\n"`);
    }
  }
  if (opt && typeof opt.maxAge === "number" && opt.maxAge >= 0) {
    if (opt.maxAge > 3456e4) {
      throw new Error(
        "Cookies Max-Age SHOULD NOT be greater than 400 days (34560000 seconds) in duration."
      );
    }
    cookie += `; Max-Age=${opt.maxAge | 0}`;
  }
  if (opt.domain && opt.prefix !== "host") {
    cookie += `; Domain=${opt.domain}`;
  }
  if (opt.path) {
    cookie += `; Path=${opt.path}`;
  }
  if (opt.expires) {
    if (opt.expires.getTime() - Date.now() > 3456e7) {
      throw new Error(
        "Cookies Expires SHOULD NOT be greater than 400 days (34560000 seconds) in the future."
      );
    }
    cookie += `; Expires=${opt.expires.toUTCString()}`;
  }
  if (opt.httpOnly) {
    cookie += "; HttpOnly";
  }
  if (opt.secure) {
    cookie += "; Secure";
  }
  if (opt.sameSite) {
    cookie += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`;
  }
  if (opt.priority) {
    cookie += `; Priority=${opt.priority.charAt(0).toUpperCase() + opt.priority.slice(1)}`;
  }
  if (opt.partitioned) {
    if (!opt.secure) {
      throw new Error("Partitioned Cookie must have Secure attributes");
    }
    cookie += "; Partitioned";
  }
  return cookie;
};
var serialize = (name, value, opt) => {
  value = encodeURIComponent(value);
  return _serialize(name, value, opt);
};

// node_modules/hono/dist/helper/cookie/index.js
var getCookie = (c, key, prefix) => {
  const cookie = c.req.raw.headers.get("Cookie");
  if (typeof key === "string") {
    if (!cookie) {
      return void 0;
    }
    let finalKey = key;
    if (prefix === "secure") {
      finalKey = "__Secure-" + key;
    } else if (prefix === "host") {
      finalKey = "__Host-" + key;
    }
    const obj2 = parse(cookie, finalKey);
    return obj2[finalKey];
  }
  if (!cookie) {
    return {};
  }
  const obj = parse(cookie);
  return obj;
};
var generateCookie = (name, value, opt) => {
  let cookie;
  if (opt?.prefix === "secure") {
    cookie = serialize("__Secure-" + name, value, { path: "/", ...opt, secure: true });
  } else if (opt?.prefix === "host") {
    cookie = serialize("__Host-" + name, value, {
      ...opt,
      path: "/",
      secure: true,
      domain: void 0
    });
  } else {
    cookie = serialize(name, value, { path: "/", ...opt });
  }
  return cookie;
};
var setCookie = (c, name, value, opt) => {
  const cookie = generateCookie(name, value, opt);
  c.header("Set-Cookie", cookie, { append: true });
};
var deleteCookie = (c, name, opt) => {
  const deletedCookie = getCookie(c, name, opt?.prefix);
  setCookie(c, name, "", { ...opt, maxAge: 0 });
  return deletedCookie;
};

// src/lib/crypto.ts
function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
function randomHex(byteLen = 16) {
  const arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return toHex(arr.buffer);
}
async function hashPassword(password, saltHex) {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 1e5, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return { hash: toHex(bits), salt: toHex(salt.buffer) };
}
async function verifyPassword(password, hashHex, saltHex) {
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqual(hash, hashHex);
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
async function hmac(secretHex, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    fromHex(secretHex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(sig);
}
async function createSessionToken(secretHex) {
  const expires = Date.now() + 30 * 24 * 60 * 60 * 1e3;
  const payload = `${expires}`;
  const sig = await hmac(secretHex, payload);
  return `${payload}.${sig}`;
}
async function verifySessionToken(secretHex, token) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [expiresStr, sig] = parts;
  const expected = await hmac(secretHex, expiresStr);
  if (!timingSafeEqual(expected, sig)) return false;
  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires) || Date.now() > expires) return false;
  return true;
}

// src/lib/auth.ts
var SESSION_COOKIE = "shokunin_session";
async function authMiddleware(c, next) {
  const result = await c.env.DB.execute("SELECT session_secret, password_hash FROM settings WHERE id = 1");
  const settings = result.rows[0];
  if (!settings?.password_hash) {
    return next();
  }
  const token = getCookie(c, SESSION_COOKIE);
  const ok = settings.session_secret ? await verifySessionToken(settings.session_secret, token) : false;
  if (!ok) {
    return c.json({ error: "\u30ED\u30B0\u30A4\u30F3\u304C\u5FC5\u8981\u3067\u3059" }, 401);
  }
  return next();
}
function setSessionCookie(c, token) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}
function clearSessionCookie(c) {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

// src/lib/db.ts
import { createClient } from "@libsql/client";
function createDbClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL environment variable is required");
  }
  return createClient({ url, authToken });
}
var PreparedStatement = class {
  client;
  sql;
  args;
  constructor(client, sql) {
    this.client = client;
    this.sql = sql;
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }
  async run() {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    return { meta: { last_row_id: Number(result.lastInsertRowid ?? 0) } };
  }
  async first() {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    if (result.rows.length === 0) return null;
    return rowToObject(result.rows[0], result.columns);
  }
  async all() {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    const results = result.rows.map((row) => rowToObject(row, result.columns));
    return { results };
  }
};
function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}
var D1LikeClient = class {
  constructor(client) {
    this.client = client;
  }
  client;
  prepare(sql) {
    return new PreparedStatement(this.client, sql);
  }
  async execute(sql, args) {
    const result = await this.client.execute({ sql, args: args ?? [] });
    const rows = result.rows.map((row) => rowToObject(row, result.columns));
    return { rows };
  }
};

// src/lib/storage.ts
import { put, del } from "@vercel/blob";
import * as fs from "fs";
import * as path from "path";
var isVercel = !!process.env.BLOB_READ_WRITE_TOKEN;
function getBlobStoreId() {
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const match2 = token.match(/vercel_blob_rw_([^_]+)_/);
  return match2 ? match2[1] : "";
}
var LOCAL_STORAGE_DIR = path.join(process.cwd(), ".local-storage");
function ensureLocalDir() {
  if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
    fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
  }
}
var r2Adapter = {
  async put(key, body, opts) {
    const buffer = body instanceof ArrayBuffer ? Buffer.from(body) : body;
    const contentType = opts?.httpMetadata?.contentType ?? "application/octet-stream";
    if (isVercel) {
      await put(key, buffer, {
        access: "public",
        contentType,
        addRandomSuffix: false
      });
    } else {
      ensureLocalDir();
      const safePath = path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, "_"));
      fs.writeFileSync(safePath, buffer);
      fs.writeFileSync(safePath + ".meta", JSON.stringify({ contentType }));
    }
  },
  async get(key) {
    if (isVercel) {
      try {
        const storeId = getBlobStoreId();
        const blobUrl = `https://${storeId}.public.blob.vercel-storage.com/${key}`;
        const res = await fetch(blobUrl);
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        const contentType = res.headers.get("content-type") ?? "application/octet-stream";
        return { body: Buffer.from(arrayBuffer), contentType };
      } catch {
        return null;
      }
    } else {
      ensureLocalDir();
      const safePath = path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, "_"));
      if (!fs.existsSync(safePath)) return null;
      const body = fs.readFileSync(safePath);
      let contentType = "application/octet-stream";
      try {
        const meta = JSON.parse(fs.readFileSync(safePath + ".meta", "utf-8"));
        contentType = meta.contentType ?? contentType;
      } catch {
      }
      return { body, contentType };
    }
  },
  async delete(key) {
    if (isVercel) {
      try {
        const storeId = getBlobStoreId();
        const blobUrl = `https://${storeId}.public.blob.vercel-storage.com/${key}`;
        await del(blobUrl);
      } catch {
      }
    } else {
      ensureLocalDir();
      const safePath = path.join(LOCAL_STORAGE_DIR, key.replace(/\//g, "_"));
      if (fs.existsSync(safePath)) fs.unlinkSync(safePath);
      if (fs.existsSync(safePath + ".meta")) fs.unlinkSync(safePath + ".meta");
    }
  }
};

// src/routes/auth.ts
var auth = new Hono2();
auth.get("/status", async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT password_hash, session_secret FROM settings WHERE id = 1"
  ).first();
  const needsSetup = !result?.password_hash;
  let loggedIn = needsSetup;
  if (!needsSetup) {
    const token = getCookie(c, SESSION_COOKIE);
    loggedIn = result.session_secret ? await verifySessionToken(result.session_secret, token) : false;
  }
  return c.json({ needsSetup, loggedIn });
});
auth.post("/setup", async (c) => {
  const { password } = await c.req.json();
  if (!password || password.length < 4) {
    return c.json({ error: "\u30D1\u30B9\u30EF\u30FC\u30C9\u306F4\u6587\u5B57\u4EE5\u4E0A\u3067\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044" }, 400);
  }
  const existing = await c.env.DB.prepare(
    "SELECT password_hash FROM settings WHERE id = 1"
  ).first();
  if (existing?.password_hash) {
    return c.json({ error: "\u65E2\u306B\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u3059" }, 400);
  }
  const { hash, salt } = await hashPassword(password);
  const sessionSecret = randomHex(32);
  await c.env.DB.prepare(
    "UPDATE settings SET password_hash = ?, password_salt = ?, session_secret = ? WHERE id = 1"
  ).bind(hash, salt, sessionSecret).run();
  const token = await createSessionToken(sessionSecret);
  setSessionCookie(c, token);
  return c.json({ success: true });
});
auth.post("/login", async (c) => {
  const { password } = await c.req.json();
  const settings = await c.env.DB.prepare(
    "SELECT password_hash, password_salt, session_secret FROM settings WHERE id = 1"
  ).first();
  if (!settings?.password_hash || !settings.password_salt) {
    return c.json({ error: "\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u672A\u8A2D\u5B9A\u3067\u3059" }, 400);
  }
  const ok = await verifyPassword(password ?? "", settings.password_hash, settings.password_salt);
  if (!ok) {
    return c.json({ error: "\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u9055\u3044\u307E\u3059" }, 401);
  }
  let sessionSecret = settings.session_secret;
  if (!sessionSecret) {
    sessionSecret = randomHex(32);
    await c.env.DB.prepare("UPDATE settings SET session_secret = ? WHERE id = 1").bind(sessionSecret).run();
  }
  const token = await createSessionToken(sessionSecret);
  setSessionCookie(c, token);
  return c.json({ success: true });
});
auth.post("/logout", async (c) => {
  clearSessionCookie(c);
  return c.json({ success: true });
});
auth.post("/change-password", async (c) => {
  const { currentPassword, newPassword } = await c.req.json();
  if (!newPassword || newPassword.length < 4) {
    return c.json({ error: "\u65B0\u3057\u3044\u30D1\u30B9\u30EF\u30FC\u30C9\u306F4\u6587\u5B57\u4EE5\u4E0A\u3067\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044" }, 400);
  }
  const settings = await c.env.DB.prepare(
    "SELECT password_hash, password_salt FROM settings WHERE id = 1"
  ).first();
  if (settings?.password_hash && settings.password_salt) {
    const ok = await verifyPassword(currentPassword ?? "", settings.password_hash, settings.password_salt);
    if (!ok) {
      return c.json({ error: "\u73FE\u5728\u306E\u30D1\u30B9\u30EF\u30FC\u30C9\u304C\u9055\u3044\u307E\u3059" }, 401);
    }
  }
  const { hash, salt } = await hashPassword(newPassword);
  const sessionSecret = randomHex(32);
  await c.env.DB.prepare(
    "UPDATE settings SET password_hash = ?, password_salt = ?, session_secret = ? WHERE id = 1"
  ).bind(hash, salt, sessionSecret).run();
  const token = await createSessionToken(sessionSecret);
  setSessionCookie(c, token);
  return c.json({ success: true });
});
var auth_default = auth;

// src/routes/settings.ts
var settingsRoute = new Hono2();
settingsRoute.get("/", async (c) => {
  const s = await c.env.DB.prepare(
    `SELECT company_name, owner_name, postal_code, address, phone, email,
            bank_name, bank_branch, bank_account_type, bank_account_number, bank_account_holder,
            default_fee_percent, default_tax_rate, invoice_prefix
     FROM settings WHERE id = 1`
  ).first();
  return c.json(s);
});
settingsRoute.put("/", async (c) => {
  const body = await c.req.json();
  const fields = [
    "company_name",
    "owner_name",
    "postal_code",
    "address",
    "phone",
    "email",
    "bank_name",
    "bank_branch",
    "bank_account_type",
    "bank_account_number",
    "bank_account_holder",
    "default_fee_percent",
    "default_tax_rate",
    "invoice_prefix"
  ];
  const setClauses = fields.map((f) => `${f} = ?`).join(", ");
  const values = fields.map((f) => body[f] ?? (f.includes("percent") || f.includes("rate") ? 0 : ""));
  await c.env.DB.prepare(`UPDATE settings SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).bind(...values).run();
  return c.json({ success: true });
});
var settings_default = settingsRoute;

// src/routes/customers.ts
var customers = new Hono2();
customers.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.*,
       (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id) as invoice_count,
       (SELECT COUNT(*) FROM purchases p WHERE p.customer_id = c.id) as purchase_count
     FROM customers c ORDER BY c.created_at DESC`
  ).all();
  return c.json(results);
});
customers.get("/:id", async (c) => {
  const id = c.req.param("id");
  const customer = await c.env.DB.prepare("SELECT * FROM customers WHERE id = ?").bind(id).first();
  if (!customer) return c.json({ error: "\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  const { results: purchases2 } = await c.env.DB.prepare(
    "SELECT * FROM purchases WHERE customer_id = ? ORDER BY purchase_date DESC, created_at DESC"
  ).bind(id).all();
  const { results: invoices2 } = await c.env.DB.prepare(
    "SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC"
  ).bind(id).all();
  return c.json({ customer, purchases: purchases2, invoices: invoices2 });
});
customers.post("/", async (c) => {
  const { name, postal_code, address, phone, memo } = await c.req.json();
  if (!name) return c.json({ error: "\u6C0F\u540D/\u4F1A\u793E\u540D\u306F\u5FC5\u9808\u3067\u3059" }, 400);
  const result = await c.env.DB.prepare(
    "INSERT INTO customers (name, postal_code, address, phone, memo) VALUES (?, ?, ?, ?, ?)"
  ).bind(name, postal_code ?? "", address ?? "", phone ?? "", memo ?? "").run();
  return c.json({ id: result.meta.last_row_id });
});
customers.put("/:id", async (c) => {
  const id = c.req.param("id");
  const { name, postal_code, address, phone, memo } = await c.req.json();
  await c.env.DB.prepare("UPDATE customers SET name=?, postal_code=?, address=?, phone=?, memo=? WHERE id=?").bind(name, postal_code ?? "", address ?? "", phone ?? "", memo ?? "", id).run();
  return c.json({ success: true });
});
customers.delete("/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.prepare("DELETE FROM customers WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});
var customers_default = customers;

// src/lib/openai.ts
var SYSTEM_PROMPT = `\u3042\u306A\u305F\u306F\u5EFA\u7BC9\u696D\u306E\u8077\u4EBA\u304C\u53D7\u3051\u53D6\u308B\u4ED5\u5165\u308C\u66F8\u985E(\u898B\u7A4D\u66F8\u30FB\u8ACB\u6C42\u66F8\u30FB\u30EC\u30B7\u30FC\u30C8\u30FB\u7D0D\u54C1\u66F8)\u3092\u8AAD\u307F\u53D6\u308BOCR\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u3067\u3059\u3002
\u753B\u50CF\u304B\u3089\u4EE5\u4E0B\u306E\u60C5\u5831\u3092\u62BD\u51FA\u3057\u3001\u5FC5\u305A\u6709\u52B9\u306AJSON\u306E\u307F\u3067\u56DE\u7B54\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u8AAC\u660E\u6587\u306F\u4E0D\u8981\u3067\u3059\u3002

\u51FA\u529B\u30D5\u30A9\u30FC\u30DE\u30C3\u30C8:
{
  "vendor_name": "\u4ED5\u5165\u5148/\u5E97\u8217\u540D(\u6587\u5B57\u5217\u3001\u4E0D\u660E\u306A\u3089\u7A7A\u6587\u5B57)",
  "document_type": "\u898B\u7A4D\u66F8 or \u8ACB\u6C42\u66F8 or \u30EC\u30B7\u30FC\u30C8 or \u7D0D\u54C1\u66F8 \u306E\u3044\u305A\u308C\u304B(\u4E0D\u660E\u306A\u3089\u7A7A\u6587\u5B57)",
  "purchase_date": "YYYY-MM-DD\u5F62\u5F0F\u306E\u65E5\u4ED8(\u4E0D\u660E\u306A\u3089\u7A7A\u6587\u5B57)",
  "total_amount": \u5408\u8A08\u91D1\u984D\u306E\u6570\u5024(\u30AB\u30F3\u30DE\u30FB\u5186\u8A18\u53F7\u3092\u9664\u3044\u305F\u6570\u5024\u306E\u307F\u3001\u4E0D\u660E\u306A\u30890),
  "items": [
    { "name": "\u54C1\u76EE\u540D", "quantity": \u6570\u91CF(\u6570\u5024\u3001\u4E0D\u660E\u306A\u30891), "unit": "\u5358\u4F4D(\u6587\u5B57\u5217\u3002\u4F8B: \u5F0F, m, m2, kg, \u672C, \u679A, \u500B, \u53F0, \u30BB\u30C3\u30C8\u7B49\u3002\u4E0D\u660E\u306A\u3089\u7A7A\u6587\u5B57)", "unit_price": \u5358\u4FA1(\u6570\u5024\u3001\u4E0D\u660E\u306A\u30890), "amount": \u91D1\u984D(\u6570\u5024) }
  ]
}

\u6CE8\u610F\u70B9:
- unit\u306F\u66F8\u985E\u306B\u8A18\u8F09\u3055\u308C\u3066\u3044\u308B\u5358\u4F4D\u8868\u8A18\u3092\u305D\u306E\u307E\u307E\u4F7F\u3046(\u300C1\u5F0F\u300D\u306A\u3089"\u5F0F"\u3001\u300C10m\u300D\u306A\u3089"m"\u306A\u3069)\u3002\u8A18\u8F09\u304C\u306A\u3051\u308C\u3070\u7A7A\u6587\u5B57\u306B\u3059\u308B
- \u6570\u91CF\u30FB\u5358\u4FA1\u30FB\u91D1\u984D\u306F\u6570\u5024\u306E\u307F(\u30AB\u30F3\u30DE\u3001\u5186\u30DE\u30FC\u30AF\u3001\u7A0E\u8FBC\u8868\u8A18\u7B49\u306F\u9664\u53BB)
- \u660E\u7D30\u304C\u8AAD\u307F\u53D6\u308C\u306A\u3044\u5834\u5408\u306Fitems\u3092\u7A7A\u914D\u5217\u306B\u3059\u308B\u4EE3\u308F\u308A\u306B\u3001\u5408\u8A08\u91D1\u984D\u306E\u307F\u30921\u3064\u306E\u9805\u76EE\u3068\u3057\u3066\u63A8\u5B9A\u3057\u3066\u3088\u3044
- \u624B\u66F8\u304D\u3084\u4E0D\u9BAE\u660E\u306A\u90E8\u5206\u306F\u7121\u7406\u306B\u63A8\u6E2C\u305B\u305A\u3001\u8AAD\u307F\u53D6\u308C\u308B\u7BC4\u56F2\u3067\u69CB\u308F\u306A\u3044
- \u5FC5\u305AJSON\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u306E\u307F\u3092\u51FA\u529B\u3059\u308B\u3053\u3068`;
async function extractPurchaseFromImage(apiKey, baseUrl, imageBase64, contentType, fileName) {
  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const isPdf = contentType === "application/pdf";
  const dataUrl = `data:${contentType};base64,${imageBase64}`;
  const fileContent = isPdf ? { type: "file", file: { filename: fileName || "document.pdf", file_data: dataUrl } } : { type: "image_url", image_url: { url: dataUrl } };
  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: `\u3053\u306E${isPdf ? "PDF" : "\u753B\u50CF"}\u304B\u3089\u4ED5\u5165\u308C\u60C5\u5831\u3092\u62BD\u51FA\u3057\u3066JSON\u3067\u8FD4\u3057\u3066\u304F\u3060\u3055\u3044\u3002` },
          fileContent
        ]
      }
    ],
    response_format: { type: "json_object" }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${errText}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI\u304B\u3089\u306E\u5FDC\u7B54\u304C\u7A7A\u3067\u3059");
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error("OpenAI\u306E\u5FDC\u7B54\u3092JSON\u3068\u3057\u3066\u89E3\u6790\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F");
  }
  const items = Array.isArray(parsed.items) ? parsed.items.map((it) => ({
    name: String(it.name ?? "").slice(0, 200),
    quantity: toNumber(it.quantity, 1),
    unit: String(it.unit ?? "").slice(0, 20),
    unit_price: toNumber(it.unit_price, 0),
    amount: toNumber(it.amount, toNumber(it.quantity, 1) * toNumber(it.unit_price, 0))
  })) : [];
  return {
    vendor_name: String(parsed.vendor_name ?? "").slice(0, 200),
    document_type: String(parsed.document_type ?? "").slice(0, 50),
    purchase_date: normalizeDate(String(parsed.purchase_date ?? "")),
    total_amount: toNumber(parsed.total_amount, items.reduce((s, i) => s + i.amount, 0)),
    items
  };
}
function toNumber(v, fallback) {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,¥円\s]/g, "");
    const n = parseFloat(cleaned);
    if (!isNaN(n)) return n;
  }
  return fallback;
}
function normalizeDate(s) {
  const m = s.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

// src/routes/purchases.ts
var purchases = new Hono2();
purchases.get("/", async (c) => {
  const customerId = c.req.query("customer_id");
  const unassigned = c.req.query("unassigned");
  let query = `SELECT p.*, cu.name as customer_name FROM purchases p LEFT JOIN customers cu ON cu.id = p.customer_id`;
  const conditions = [];
  const binds = [];
  if (customerId) {
    conditions.push("p.customer_id = ?");
    binds.push(customerId);
  }
  if (unassigned === "1") {
    conditions.push("p.customer_id IS NULL");
  }
  if (conditions.length) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY p.created_at DESC";
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json(results);
});
purchases.get("/items/available", async (c) => {
  const customerId = c.req.query("customer_id");
  if (!customerId) return c.json({ error: "customer_id\u304C\u5FC5\u8981\u3067\u3059" }, 400);
  const { results } = await c.env.DB.prepare(
    `SELECT pi.*, p.vendor_name, p.document_type, p.purchase_date, p.id as purchase_id
     FROM purchase_items pi
     JOIN purchases p ON p.id = pi.purchase_id
     WHERE p.customer_id = ? AND pi.used_in_invoice_id IS NULL
     ORDER BY p.purchase_date DESC, pi.sort_order`
  ).bind(customerId).all();
  return c.json(results);
});
purchases.get("/:id", async (c) => {
  const id = c.req.param("id");
  const purchase = await c.env.DB.prepare("SELECT * FROM purchases WHERE id = ?").bind(id).first();
  if (!purchase) return c.json({ error: "\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  const { results: items } = await c.env.DB.prepare(
    "SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY sort_order, id"
  ).bind(id).all();
  return c.json({ purchase, items });
});
purchases.post("/upload", async (c) => {
  const form = await c.req.formData();
  const file = form.get("image");
  const customerId = form.get("customer_id");
  if (!file) {
    return c.json({ error: "\u753B\u50CF\u30D5\u30A1\u30A4\u30EB\u304C\u5FC5\u8981\u3067\u3059" }, 400);
  }
  let contentType = file.type || "image/jpeg";
  if ((!contentType || contentType === "application/octet-stream") && /\.pdf$/i.test(file.name || "")) {
    contentType = "application/pdf";
  }
  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
  if (!allowedTypes.includes(contentType)) {
    return c.json({ error: "\u5BFE\u5FDC\u3057\u3066\u3044\u306A\u3044\u30D5\u30A1\u30A4\u30EB\u5F62\u5F0F\u3067\u3059\uFF08\u753B\u50CF\u307E\u305F\u306FPDF\u306E\u307F\uFF09" }, 400);
  }
  const arrayBuffer = await file.arrayBuffer();
  const extMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf"
  };
  const ext = extMap[contentType] || "bin";
  const imageKey = `purchases/${Date.now()}-${randomHex(6)}.${ext}`;
  const base64 = arrayBufferToBase64(arrayBuffer);
  const [, ocrSettled] = await Promise.allSettled([
    c.env.R2.put(imageKey, arrayBuffer, { httpMetadata: { contentType } }),
    extractPurchaseFromImage(c.env.OPENAI_API_KEY, c.env.OPENAI_BASE_URL, base64, contentType, file.name)
  ]);
  let ocrResult;
  let ocrError = null;
  if (ocrSettled.status === "fulfilled") {
    ocrResult = ocrSettled.value;
  } else {
    const err = ocrSettled.reason;
    ocrError = err?.message ? String(err.message).slice(0, 500) : "OCR\u51E6\u7406\u3067\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F";
    ocrResult = {
      vendor_name: "",
      document_type: "",
      purchase_date: "",
      total_amount: 0,
      items: []
    };
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO purchases (customer_id, vendor_name, document_type, purchase_date, image_key, image_content_type, total_amount, ocr_raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    customerId || null,
    ocrResult.vendor_name,
    ocrResult.document_type,
    ocrResult.purchase_date,
    imageKey,
    contentType,
    ocrResult.total_amount,
    JSON.stringify(ocrResult)
  ).run();
  const purchaseId = result.meta.last_row_id;
  for (let i = 0; i < ocrResult.items.length; i++) {
    const it = ocrResult.items[i];
    await c.env.DB.prepare(
      `INSERT INTO purchase_items (purchase_id, name, quantity, unit, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(purchaseId, it.name, it.quantity, it.unit || "", it.unit_price, it.amount, i).run();
  }
  return c.json({
    id: purchaseId,
    vendor_name: ocrResult.vendor_name,
    document_type: ocrResult.document_type,
    purchase_date: ocrResult.purchase_date,
    total_amount: ocrResult.total_amount,
    image_key: imageKey,
    content_type: contentType,
    items: ocrResult.items,
    ocr_error: ocrError
  });
});
purchases.get("/:id/image", async (c) => {
  const id = c.req.param("id");
  const purchase = await c.env.DB.prepare("SELECT image_key, image_content_type FROM purchases WHERE id = ?").bind(id).first();
  if (!purchase?.image_key) return c.json({ error: "\u753B\u50CF\u304C\u3042\u308A\u307E\u305B\u3093" }, 404);
  const obj = await c.env.R2.get(purchase.image_key);
  if (!obj) return c.json({ error: "\u753B\u50CF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  return new Response(obj.body, {
    headers: { "Content-Type": purchase.image_content_type || "image/jpeg" }
  });
});
purchases.put("/:id", async (c) => {
  const id = c.req.param("id");
  const { customer_id, vendor_name, document_type, purchase_date, total_amount, memo } = await c.req.json();
  await c.env.DB.prepare(
    `UPDATE purchases SET customer_id=?, vendor_name=?, document_type=?, purchase_date=?, total_amount=?, memo=? WHERE id=?`
  ).bind(customer_id || null, vendor_name ?? "", document_type ?? "", purchase_date ?? "", total_amount ?? 0, memo ?? "", id).run();
  return c.json({ success: true });
});
purchases.put("/:id/items", async (c) => {
  const purchaseId = c.req.param("id");
  const { items } = await c.req.json();
  await c.env.DB.prepare("DELETE FROM purchase_items WHERE purchase_id = ?").bind(purchaseId).run();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await c.env.DB.prepare(
      `INSERT INTO purchase_items (purchase_id, name, quantity, unit, unit_price, amount, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(purchaseId, it.name, it.quantity, it.unit || "", it.unit_price, it.amount, i).run();
  }
  const total = items.reduce((s, i) => s + i.amount, 0);
  await c.env.DB.prepare("UPDATE purchases SET total_amount = ? WHERE id = ?").bind(total, purchaseId).run();
  return c.json({ success: true });
});
purchases.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const purchase = await c.env.DB.prepare("SELECT image_key FROM purchases WHERE id = ?").bind(id).first();
  await c.env.DB.prepare("DELETE FROM purchase_items WHERE purchase_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM purchases WHERE id = ?").bind(id).run();
  if (purchase?.image_key) {
    await c.env.R2.delete(purchase.image_key).catch(() => {
    });
  }
  return c.json({ success: true });
});
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 32768;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return Buffer.from(binary, "binary").toString("base64");
}
var purchases_default = purchases;

// src/routes/invoices.ts
var invoices = new Hono2();
var TAX_RATE = 10;
function round(n) {
  return Math.round(n);
}
function calcInvoice(items, defaultFeePercent) {
  const computed = items.map((it) => {
    const cost = it.cost_amount;
    const feePercent = it.fee_percent === null || it.fee_percent === void 0 ? defaultFeePercent : it.fee_percent;
    const billed = round(cost * (1 + feePercent / 100));
    const profitAmount = billed - cost;
    const itemTax = round(billed * (TAX_RATE / 100));
    return { ...it, fee_percent: feePercent, billed_amount: billed, profit_amount: profitAmount, tax_amount: itemTax };
  });
  const subtotalCost = round(computed.reduce((s, i) => s + i.cost_amount, 0));
  const amountBeforeTax = round(computed.reduce((s, i) => s + i.billed_amount, 0));
  const feeAmount = amountBeforeTax - subtotalCost;
  const taxAmount = round(computed.reduce((s, i) => s + i.tax_amount, 0));
  const totalAmount = amountBeforeTax + taxAmount;
  return { computed, subtotalCost, feeAmount, amountBeforeTax, taxAmount, totalAmount };
}
invoices.get("/", async (c) => {
  const customerId = c.req.query("customer_id");
  let query = `SELECT i.*, c.name as customer_name FROM invoices i JOIN customers c ON c.id = i.customer_id`;
  const binds = [];
  if (customerId) {
    query += " WHERE i.customer_id = ?";
    binds.push(customerId);
  }
  query += " ORDER BY i.created_at DESC";
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json(results);
});
invoices.get("/:id", async (c) => {
  const id = c.req.param("id");
  const invoice = await c.env.DB.prepare(
    `SELECT i.*, c.name as customer_name, c.postal_code as customer_postal_code, c.address as customer_address, c.phone as customer_phone
     FROM invoices i JOIN customers c ON c.id = i.customer_id WHERE i.id = ?`
  ).bind(id).first();
  if (!invoice) return c.json({ error: "\u898B\u3064\u304B\u308A\u307E\u305B\u3093" }, 404);
  const { results: items } = await c.env.DB.prepare(
    "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, id"
  ).bind(id).all();
  const itemsWithCalc = items.map((it) => {
    const cost = Number(it.cost_amount) || 0;
    const billed = Number(it.billed_amount) || 0;
    const feePercent = it.fee_percent !== null && it.fee_percent !== void 0 ? it.fee_percent : cost > 0 ? round((billed - cost) / cost * 1e4) / 100 : 0;
    return {
      ...it,
      fee_percent: feePercent,
      profit_amount: billed - cost,
      tax_amount: round(billed * (TAX_RATE / 100))
    };
  });
  const settings = await c.env.DB.prepare("SELECT * FROM settings WHERE id = 1").first();
  return c.json({ invoice, items: itemsWithCalc, settings });
});
invoices.post("/", async (c) => {
  const body = await c.req.json();
  if (!body.customer_id || !body.items?.length) {
    return c.json({ error: "\u9867\u5BA2\u3068\u660E\u7D30\u306F\u5FC5\u9808\u3067\u3059" }, 400);
  }
  const settings = await c.env.DB.prepare(
    "SELECT invoice_prefix, next_invoice_seq FROM settings WHERE id = 1"
  ).first();
  const seq = settings?.next_invoice_seq ?? 1;
  const invoiceNumber = `${settings?.invoice_prefix ?? "INV-"}${String(seq).padStart(4, "0")}`;
  const { computed, subtotalCost, feeAmount, amountBeforeTax, taxAmount, totalAmount } = calcInvoice(
    body.items,
    body.fee_percent
  );
  const result = await c.env.DB.prepare(
    `INSERT INTO invoices (customer_id, invoice_number, issue_date, due_date, fee_percent, tax_rate,
       subtotal_cost, fee_amount, amount_before_tax, tax_amount, total_amount, memo, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`
  ).bind(
    body.customer_id,
    invoiceNumber,
    body.issue_date ?? "",
    body.due_date ?? "",
    body.fee_percent,
    TAX_RATE,
    subtotalCost,
    feeAmount,
    amountBeforeTax,
    taxAmount,
    totalAmount,
    body.memo ?? ""
  ).run();
  const invoiceId = result.meta.last_row_id;
  for (let i = 0; i < computed.length; i++) {
    const it = computed[i];
    await c.env.DB.prepare(
      `INSERT INTO invoice_items (invoice_id, purchase_item_id, name, quantity, unit, unit_price, cost_amount, billed_amount, fee_percent, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(invoiceId, it.purchase_item_id ?? null, it.name, it.quantity, it.unit || "", it.unit_price, it.cost_amount, it.billed_amount, it.fee_percent, i).run();
    if (it.purchase_item_id) {
      await c.env.DB.prepare("UPDATE purchase_items SET used_in_invoice_id = ? WHERE id = ?").bind(invoiceId, it.purchase_item_id).run();
    }
  }
  await c.env.DB.prepare("UPDATE settings SET next_invoice_seq = ? WHERE id = 1").bind(seq + 1).run();
  return c.json({ id: invoiceId, invoice_number: invoiceNumber, total_amount: totalAmount });
});
invoices.put("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { computed, subtotalCost, feeAmount, amountBeforeTax, taxAmount, totalAmount } = calcInvoice(
    body.items,
    body.fee_percent
  );
  const { results: oldItems } = await c.env.DB.prepare(
    "SELECT purchase_item_id FROM invoice_items WHERE invoice_id = ? AND purchase_item_id IS NOT NULL"
  ).bind(id).all();
  for (const oi of oldItems) {
    await c.env.DB.prepare("UPDATE purchase_items SET used_in_invoice_id = NULL WHERE id = ?").bind(oi.purchase_item_id).run();
  }
  await c.env.DB.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").bind(id).run();
  await c.env.DB.prepare(
    `UPDATE invoices SET customer_id=?, issue_date=?, due_date=?, fee_percent=?, tax_rate=?,
       subtotal_cost=?, fee_amount=?, amount_before_tax=?, tax_amount=?, total_amount=?, memo=?
     WHERE id=?`
  ).bind(
    body.customer_id,
    body.issue_date ?? "",
    body.due_date ?? "",
    body.fee_percent,
    TAX_RATE,
    subtotalCost,
    feeAmount,
    amountBeforeTax,
    taxAmount,
    totalAmount,
    body.memo ?? "",
    id
  ).run();
  for (let i = 0; i < computed.length; i++) {
    const it = computed[i];
    await c.env.DB.prepare(
      `INSERT INTO invoice_items (invoice_id, purchase_item_id, name, quantity, unit, unit_price, cost_amount, billed_amount, fee_percent, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, it.purchase_item_id ?? null, it.name, it.quantity, it.unit || "", it.unit_price, it.cost_amount, it.billed_amount, it.fee_percent, i).run();
    if (it.purchase_item_id) {
      await c.env.DB.prepare("UPDATE purchase_items SET used_in_invoice_id = ? WHERE id = ?").bind(id, it.purchase_item_id).run();
    }
  }
  return c.json({ success: true, total_amount: totalAmount });
});
invoices.put("/:id/status", async (c) => {
  const id = c.req.param("id");
  const { status } = await c.req.json();
  await c.env.DB.prepare("UPDATE invoices SET status = ? WHERE id = ?").bind(status, id).run();
  return c.json({ success: true });
});
invoices.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const { results: oldItems } = await c.env.DB.prepare(
    "SELECT purchase_item_id FROM invoice_items WHERE invoice_id = ? AND purchase_item_id IS NOT NULL"
  ).bind(id).all();
  for (const oi of oldItems) {
    await c.env.DB.prepare("UPDATE purchase_items SET used_in_invoice_id = NULL WHERE id = ?").bind(oi.purchase_item_id).run();
  }
  await c.env.DB.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").bind(id).run();
  await c.env.DB.prepare("DELETE FROM invoices WHERE id = ?").bind(id).run();
  return c.json({ success: true });
});
var invoices_default = invoices;

// src/app.ts
var libsqlClient = createDbClient();
var db = new D1LikeClient(libsqlClient);
var bindings = {
  DB: db,
  R2: r2Adapter,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
};
var app = new Hono2().basePath("/api");
app.use("*", async (c, next) => {
  c.env = bindings;
  return next();
});
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.route("/auth", auth_default);
app.use("/auth/change-password", authMiddleware);
app.use("/settings/*", authMiddleware);
app.use("/customers/*", authMiddleware);
app.use("/purchases/*", authMiddleware);
app.use("/invoices/*", authMiddleware);
app.route("/settings", settings_default);
app.route("/customers", customers_default);
app.route("/purchases", purchases_default);
app.route("/invoices", invoices_default);
async function handler(req, res) {
  const url = `https://${req.headers.host || "localhost"}${req.url}`;
  const method = req.method || "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      } else {
        headers.set(key, value);
      }
    }
  }
  let body = null;
  if (method !== "GET" && method !== "HEAD") {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }
  const request = new Request(url, {
    method,
    headers,
    body: body && body.length > 0 ? body : null
  });
  const response = await app.fetch(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const responseBody = await response.arrayBuffer();
  res.end(Buffer.from(responseBody));
}
export {
  handler as default
};
