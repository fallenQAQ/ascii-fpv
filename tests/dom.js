/* =====================================================================
   ASCII FPV · 无头测试用迷你 DOM
   ---------------------------------------------------------------------
   项目零依赖，也不想为了测试引入 jsdom，所以这里实现一个刚好够用的
   DOM 子集：元素树、innerHTML 解析、querySelector(All)、事件、closest。
   ===================================================================== */
'use strict';

var VOID_TAGS = { meta: 1, link: 1, br: 1, img: 1, input: 1, hr: 1 };

function parseAttrs(s) {
  var out = {}, re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, m;
  while ((m = re.exec(s))) {
    out[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
  }
  return out;
}

function parseHTML(html, doc) {
  var root = doc.createElement('#fragment');
  var stack = [root];
  var re = /<!--[\s\S]*?-->|<!\[[\s\S]*?\]>|<\/\s*([a-zA-Z0-9-]+)\s*>|<\s*([a-zA-Z0-9-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  var last = 0, m;
  function text(s) {
    if (!s) return;
    stack[stack.length - 1].appendChild(doc.createTextNode(s));
  }
  while ((m = re.exec(html))) {
    text(html.slice(last, m.index));
    last = re.lastIndex;
    if (m[1]) {                                  // 闭合标签
      var name = m[1].toLowerCase();
      for (var i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName === name) { stack.length = i; break; }
      }
    } else if (m[2]) {                           // 开始标签
      var tag = m[2].toLowerCase();
      var el = doc.createElement(tag);
      var attrs = parseAttrs(m[3] || '');
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      stack[stack.length - 1].appendChild(el);
      if (!m[4] && !VOID_TAGS[tag]) stack.push(el);
    }
  }
  text(html.slice(last));
  return root;
}

/* ------------------------- 选择器（够用即可） ------------------------- */
function parseSimple(sel) {
  var out = { tag: null, id: null, classes: [], attrs: [] };
  var re = /([#.]?[a-zA-Z0-9_-]+)|(\[[^\]]+\])/g, m;
  while ((m = re.exec(sel))) {
    if (m[2]) {
      var body = m[2].slice(1, -1);
      var eq = body.indexOf('=');
      if (eq < 0) out.attrs.push({ k: body.trim(), v: null });
      else out.attrs.push({ k: body.slice(0, eq).trim(), v: body.slice(eq + 1).trim().replace(/^["']|["']$/g, '') });
    } else {
      var s = m[1];
      if (s[0] === '#') out.id = s.slice(1);
      else if (s[0] === '.') out.classes.push(s.slice(1));
      else out.tag = s.toLowerCase();
    }
  }
  return out;
}

function matchesSimple(node, sel) {
  if (node.nodeType !== 1) return false;
  if (sel.tag && node.tagName !== sel.tag) return false;
  if (sel.id && node.getAttribute('id') !== sel.id) return false;
  for (var i = 0; i < sel.classes.length; i++) {
    var cls = (node.getAttribute('class') || '').split(/\s+/);
    if (cls.indexOf(sel.classes[i]) < 0) return false;
  }
  for (var j = 0; j < sel.attrs.length; j++) {
    var a = sel.attrs[j], v = node.getAttribute(a.k);
    if (v === null) return false;
    if (a.v !== null && v !== a.v) return false;
  }
  return true;
}

function matchChain(node, chain) {
  var i = chain.length - 1;
  if (!matchesSimple(node, chain[i])) return false;
  i--;
  var p = node.parentNode;
  while (i >= 0 && p) {
    if (matchesSimple(p, chain[i])) i--;
    p = p.parentNode;
  }
  return i < 0;
}

function splitChain(sel) {
  return sel.trim().split(/\s+/).map(parseSimple);
}
function splitGroups(sel) {
  return String(sel).split(',').map(function (s) { return splitChain(s); });
}

/* ------------------------- 节点 ------------------------- */
function Node(doc, tagName, nodeType) {
  this.ownerDocument = doc;
  this.tagName = tagName;
  this.nodeType = nodeType;      // 1 元素 / 3 文本 / 11 片段
  this.childNodes = [];
  this.parentNode = null;
  this.attributes = {};
  this.style = {};
  this._text = '';
  this._listeners = {};
  this._id = '';
}

Node.prototype.appendChild = function (child) {
  child.parentNode = this;
  this.childNodes.push(child);
  return child;
};
Node.prototype.removeChild = function (child) {
  var i = this.childNodes.indexOf(child);
  if (i >= 0) { this.childNodes.splice(i, 1); child.parentNode = null; }
  return child;
};
Node.prototype.setAttribute = function (k, v) {
  this.attributes[String(k).toLowerCase()] = String(v);
  if (k === 'id') this._id = String(v);
};
Node.prototype.getAttribute = function (k) {
  k = String(k).toLowerCase();
  if (k === 'class') return this.className || null;
  return this.attributes[k] === undefined ? null : this.attributes[k];
};
Node.prototype.hasAttribute = function (k) { return this.getAttribute(k) !== null; };
Node.prototype.addEventListener = function (type, fn) {
  (this._listeners[type] = this._listeners[type] || []).push(fn);
};
Node.prototype.removeEventListener = function (type, fn) {
  var l = this._listeners[type] || [];
  var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1);
};
Node.prototype.dispatchEvent = function (ev) {
  ev.target = ev.target || this;
  var l = (this._listeners[ev.type] || []).slice();
  for (var i = 0; i < l.length; i++) l[i](ev);
  return true;
};
Node.prototype.querySelectorAll = function (sel) {
  var groups = splitGroups(sel), out = [];
  (function walk(node) {
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType !== 1) continue;
      for (var g = 0; g < groups.length; g++) {
        if (matchChain(c, groups[g])) { out.push(c); break; }
      }
      walk(c);
    }
  })(this);
  return out;
};
Node.prototype.querySelector = function (sel) {
  var r = this.querySelectorAll(sel);
  return r.length ? r[0] : null;
};
Node.prototype.closest = function (sel) {
  var groups = splitGroups(sel), n = this;
  while (n && n.nodeType === 1) {
    for (var g = 0; g < groups.length; g++) if (matchChain(n, groups[g])) return n;
    n = n.parentNode;
  }
  return null;
};
Node.prototype.contains = function (n) {
  while (n) { if (n === this) return true; n = n.parentNode; }
  return false;
};
Node.prototype.getElementById = function (id) {
  return this.querySelector('#' + id);
};
Node.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, width: 1280, height: 720, right: 1280, bottom: 720 };
};

Object.defineProperty(Node.prototype, 'className', {
  get: function () { return this.attributes['class'] || ''; },
  set: function (v) { this.attributes['class'] = String(v); }
});
Object.defineProperty(Node.prototype, 'id', {
  get: function () { return this.attributes['id'] || ''; },
  set: function (v) { this.attributes['id'] = String(v); }
});
Object.defineProperty(Node.prototype, 'firstChild', {
  get: function () { return this.childNodes.length ? this.childNodes[0] : null; }
});
Object.defineProperty(Node.prototype, 'children', {
  get: function () { return this.childNodes.filter(function (c) { return c.nodeType === 1; }); }
});
Object.defineProperty(Node.prototype, 'innerHTML', {
  get: function () {
    var s = this._text || '';
    for (var i = 0; i < this.childNodes.length; i++) s += serialize(this.childNodes[i]);
    return s;
  },
  set: function (html) {
    this.childNodes = [];
    this._text = '';
    var frag = parseHTML(String(html), this.ownerDocument);
    for (var i = 0; i < frag.childNodes.length; i++) this.appendChild(frag.childNodes[i]);
  }
});
Object.defineProperty(Node.prototype, 'outerHTML', {
  get: function () { return serialize(this); }
});
Object.defineProperty(Node.prototype, 'textContent', {
  get: function () {
    if (this.nodeType === 3) return this._text;
    var s = this._text || '';
    for (var i = 0; i < this.childNodes.length; i++) s += this.childNodes[i].textContent;
    return s;
  },
  set: function (v) { this.childNodes = []; this._text = String(v); }
});

function serialize(node) {
  if (node.nodeType === 3) return node._text;
  var tag = node.tagName, attrs = '';
  for (var k in node.attributes) {
    if (k === 'class' && !node.attributes[k]) continue;
    attrs += ' ' + k + '="' + String(node.attributes[k]).replace(/"/g, '&quot;') + '"';
  }
  if (VOID_TAGS[tag]) return '<' + tag + attrs + '>';
  return '<' + tag + attrs + '>' + node.innerHTML + '</' + tag + '>';
}

function createDocument(win) {
  var doc = {
    readyState: 'complete',
    hidden: false,
    documentElement: null,
    head: null,
    body: null,
    _byId: {}
  };
  doc.createElement = function (tag) {
    tag = String(tag).toLowerCase();
    var n = new Node(doc, tag, tag === '#fragment' || tag === '#text' ? 11 : 1);
    if (tag === '#fragment') n.nodeType = 11;
    return n;
  };
  doc.createTextNode = function (s) {
    var n = new Node(doc, '#text', 3);
    n._text = String(s);
    return n;
  };
  doc.getElementById = function (id) {
    if (doc._byId[id]) return doc._byId[id];
    return doc.documentElement ? doc.documentElement.querySelector('#' + id) : null;
  };
  doc.register = function (id, node) { doc._byId[id] = node; node.setAttribute('id', id); return node; };
  doc.querySelectorAll = function (sel) { return doc.documentElement.querySelectorAll(sel); };
  doc.querySelector = function (sel) { return doc.documentElement.querySelector(sel); };
  doc.addEventListener = function () { };
  doc.removeEventListener = function () { };
  doc.documentElement = doc.createElement('html');
  doc.documentElement.ownerDocument = doc;
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body');
  doc.body.ownerDocument = doc;
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  return doc;
}

module.exports = { createDocument: createDocument, Node: Node, parseHTML: parseHTML };
