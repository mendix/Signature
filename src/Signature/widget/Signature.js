/*jslint white: true nomen: true plusplus: true */
/*global mx, mxui, window, document, mendix, dojo, require, console, define, module, logger */
/**
	Signature
	========================
	@copyright : Mendix bv
	@license   : Apache License, Version 2.0, January 2004
*/
require([
    "mxui/widget/_WidgetBase",
    "dijit/_Widget",
    "dijit/_TemplatedMixin",
    "mxui/dom",
    "dojo/dom",
    "dojo/dom-construct",
    "dojo/_base/array",
    "dojo/_base/event",
    "dojo/ready",
    "dojo/query",
    "dojo/dom-prop",
    "dojo/dom-geometry",
    "dojo/dom-class",
    "dojo/dom-style",
    "dojo/touch",
    "dojo/on",
    "dojo/_base/lang",
    "dojo/_base/declare"
], function(_WidgetBase, _Widget, _Templated, domMx, dom, domConstruct, dojoArray, domEvent, domReady, domQuery, domProp, domGeom, domClass, domStyle, dojoTouch, on, lang, declare) {

    return declare("Signature.widget.Signature", [ _WidgetBase, _Widget, _Templated ], {
        _contextGuid: null,
        _contextObj: null,
        _handle: null,

        _smoothingpct: 0.9,

        _mxObject: null,
        _attribute: null,
        _path: null,

        _canvas: null,
        _reset: null,
        _context: null,

        _timer: null,
        _bezierBuf: null,

        templatePath: dojo.moduleUrl("Signature", "widget/templates/Signature.html"),

        postCreate: function() {
            this._setupWidget();
            this._createUI();
            this._setupEvents();
        },

        startup: function() {
            this.set("disabled", this.readonly);

            var path = this.dataUrl.split("/");
            this._attribute = path[path.length - 1];
            this._path = path.splice(0, path.length - 1);
        },

        update: function(obj, callback) {
            if (obj) {
                obj.fetch(this._path, dojo.hitch(this, function(obj) {
                    this._updateObject(obj, callback);
                }));
            } else {
                this._updateObject(null, callback);
            }
        },

        enable: function() {
            dojo.attr(this._reset, "disabled", false);
            dojo.removeClass(this.domNode, "signhereSignature_disabled");
        },

        disable: function() {
            dojo.attr(this._reset, "disabled", true);
            dojo.addClass(this.domNode, "signhereSignature_disabled");
        },

        _setupWidget: function() {
            var t = this._smoothingpct,
                u = 1 - t;

            this._bezier1 = t * t * t;
            this._bezier2 = 3 * t * t * u;
            this._bezier3 = 3 * t * u * u;
            this._bezier4 = u * u * u;

            this._bezierBuf = [];
        },

        _createUI: function() {
            var $ = domConstruct.create,
                sizeProperties = {
                    "width": this.width + "px",
                    "height": this.height + "px"
                },
                allProperties = lang.mixin(sizeProperties, {
                    "style": "border: " + this.gridborder + "px solid " + this.gridcolor
                });

            this._canvas = $("canvas", allProperties);
            this._image  = $("img", allProperties);

            this._reset = $("button", {
                "class": "btn",
                "style": {
                    "width": (this.width + 4) + "px"
                },
                "innerHTML":  this.resetcaption
            });

            this.domNode.appendChild(this._canvas);
            this.domNode.appendChild(this._image);
            this.domNode.appendChild(this._reset);

            domStyle.set(this.domNode, sizeProperties);

            this._context = this._canvas.getContext("2d");
        },

        _updateObject: function(obj, callback) {
            this._mxObject = obj;

            this._resetCanvas();

            if (this._attribute && obj && obj.get(this._attribute)) {
                this._showImage();
            } else {
                this._hideImage();
            }

            this.set("disabled", obj ? false : true);

            mendix.lang.nullExec(callback);
        },

        _showImage: function() {
            this._image.src = this._mxObject.get(this.dataUrl);

            dojo.replaceClass(this.domNode, "signature_set", "signature_unset");
        },

        _hideImage: function() {
            this._image.src = "";

            domClass.replace(this.domNode, "signature_unset", "signature_set");
        },

        _drawGrid: function() {
            if (!this.showgrid) return;

            var x = this.gridx,
                y = this.gridy,
                context = this._context,
                width   = this._canvas.width,
                height  = this._canvas.height;

            context.beginPath();

            for (; x < width; x += this.gridx) {
                context.moveTo(x, 0);
                context.lineTo(x, this._canvas.height);
            }

            for (; y < height; y += this.gridy) {
                context.moveTo(0, y);
                context.lineTo(this._canvas.width, y);
            }

            context.lineWidth = 1;
            context.strokeStyle = this.gridcolor;
            context.stroke();
        },

        _setupEvents: function() {
            on(this._canvas, dojoTouch.press, lang.hitch(this, this._beginCurve));
            on(this._reset, "click", lang.hitch(this, this._eventResetClicked));

            // This prevents the "dragging image" annoyance when someone tries to
            // draw on the image.
            on(this._image, dojoTouch.press, function(e) {
                domEvent.stop(e);
                return false;
            });
        },

        _getCoords: function(e) {
            var pos   = dojo.position(this._canvas, true),
                pageX = e.targetTouches ? e.targetTouches[0].pageX : e.pageX,
                pageY = e.targetTouches ? e.targetTouches[0].pageY : e.pageY,
                x     = Math.floor(pageX - pos.x),
                y     = Math.floor(pageY - pos.y);

            return { x: x, y: y };
        },

        _beginCurve: function(e) {
            domEvent.stop(e);

            if (this.get("disabled")) return;

            this._bezierBuf = [];

            this._stopTimeout();

            this._context.strokeStyle = this.pencolor;
            this._context.lineJoin    = "round";
            this._context.lineWidth   = this.pensize;

            this._context.beginPath();

            this._handlers = [
                on(window, dojoTouch.move, lang.hitch(this, this._updateCurve)),
                on(window, dojoTouch.release, lang.hitch(this, this._endCurve))
            ];
        },

        _updateCurve: function(e) {
            domEvent.stop(e);

            this._stopTimeout();

            if (this._movedTo) {
                this._bezierBuf.push(this._getCoords(e));

                if (this._bezierBuf.length === 4) {
                    var point = this._bezierPoint.apply(this, this._bezierBuf);

                    this._context.lineTo(point.x, point.y);
                    this._context.stroke();

                    this._bezierBuf.shift();
                    this._bezierBuf[0] = point;
                }
            } else {
                this._context.moveTo(this._getCoords(e).x, this._getCoords(e).y);
                this._movedTo = true;
            }
        },

        _endCurve: function(e) {
            domEvent.stop(e);

            this._stopTimeout();

            // Finish last points in Bezier buffer
            dojoArray.forEach(this._bezierBuf, function(position) {
                this._context.lineTo(position.x, position.y);
            }, this);

            this._context.stroke();

            dojoArray.forEach(this._handlers, function(handler) {
                handler.remove();
            });

            this._timer = setTimeout(dojo.hitch(this, this._finalizeSignature), this.timeout);
        },

        _eventResetClicked: function(e) {
            if (!this.get("disabled")) {
                this._resetMxObject();
                this._resetCanvas();

                this._hideImage();
            }
        },

        _resetCanvas: function() {
            this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);

            this._bezierBuf = [];

            this._drawGrid();
        },

        _resetMxObject: function() {
            this._mxObject.set(this.dataUrl, "");
        },

        _stopTimeout: function() {
            if (this._timer) {
                clearTimeout(this._timer);
            }
        },

        _finalizeSignature: function() {
            if (this._mxObject) {
                if (this._mxObject.has(this.dataUrl)) {
                    this._mxObject.set(this.dataUrl, this._canvas.toDataURL());
                } else {
                    logger.error(this.id + ".finalizeSignature: no dataUrl attribute found.");
                }
            }

            this._showImage();
        },

        _bezierPoint: function(c1, c2, c3, c4) {
            return {
                x: c1.x * this._bezier1 + c2.x * this._bezier2 +
                    c3.x * this._bezier3 + c4.x * this._bezier4,
                y: c1.y * this._bezier1 + c2.y * this._bezier2 +
                    c3.y * this._bezier3 + c4.y * this._bezier4
            };
        },

        _setDisabledAttr: function(value) {
            var isDisabled = this.readonly ||
                !this._mxObject ||
                !this._attribute ||
                this._mxObject.isReadonlyAttr(this._attribute) ||
                value;
            return this.inherited(arguments, [ isDisabled ]);
        }
    });
});
