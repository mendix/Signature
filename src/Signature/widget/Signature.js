/*jslint white: true nomen: true plusplus: true */
/*global mx, mxui, window, document, mendix, dojo, require, console, define, module, logger */
/**
	Signature
	========================

	@file      : Signature.js
	@version   : 2.1
	@author    : Maxim Oei, Richard Edens, Roeland Salij
	@date      : 22-08-2014
	@copyright : Mendix Technology BV
	@license   : Apache License, Version 2.0, January 2004

	Documentation
    ========================
	Complete any delivery service App with this Signature widget.
    This widget allows you to save a signature to an attribute.
*/
(function() {
    require([
        'mxui/widget/_WidgetBase', 'dijit/_Widget', 'dijit/_TemplatedMixin',
        'mxui/dom', 'dojo/dom', 'dojo/dom-construct', 'dojo/ready', 'dojo/query', 'dojo/dom-prop', 'dojo/dom-geometry', 'dojo/dom-class', 'dojo/dom-style', 'dojo/on', 'dojo/_base/lang', 'dojo/_base/declare'
    ], function(_WidgetBase, _Widget, _Templated, domMx,dom, domConstruct, domReady, domQuery, domProp, domGeom, domClass, domStyle, on, lang, declare) {

        return declare('Signature.widget.Signature', [ _WidgetBase, _Widget, _Templated ], {
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

            _touchSupport: false,
            _bezierBuf: null,

            templatePath: dojo.moduleUrl('Signature', 'widget/templates/Signature.html'),

            postCreate: function() {
                this._setupWidget();
                this._createUI();
                this._setupEvents();
            },

            startup: function() {
                this.set('disabled', this.readonly);

                var path = this.dataUrl.split('/');
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
                dojo.attr(this._reset, 'disabled', false);
                dojo.removeClass(this.domNode, 'signhereSignature_disabled');
            },

            disable: function() {
                dojo.attr(this._reset, 'disabled', true);
                dojo.addClass(this.domNode, 'signhereSignature_disabled');
            },

            _setupWidget: function() {
                var t = this._smoothingpct,
                    u = 1 - t;

                this._bezier1 = t * t * t;
                this._bezier2 = 3 * t * t * u;
                this._bezier3 = 3 * t * u * u;
                this._bezier4 = u * u * u;

                this._bezierBuf = [];

                this._touchSupport = ('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch;
            },

            _createUI: function() {
                var $ = domConstruct.create,
                    sizeProperties = {
                        'width': this.width + 'px',
                        'height': this.height + 'px'
                    },
                    allProperties = lang.mixin(sizeProperties, {
                        'style': 'border: ' + this.gridborder + 'px solid ' + this.gridcolor
                    });

                this._canvas = $('canvas', allProperties);
                this._image  = $('img', allProperties);

                this._reset = $('button', {
                    'class': 'btn',
                    'style': {
                        'width': (this.width + 4) + 'px'
                    },
                    'innerHTML':  this.resetcaption
                });

                this.domNode.appendChild(this._canvas);
                this.domNode.appendChild(this._image);
                this.domNode.appendChild(this._reset);

                domStyle.set(this.domNode, sizeProperties);

                this._context = this._canvas.getContext('2d');
            },

            _updateObject: function(obj, callback) {
                this._mxObject = obj;

                this._resetCanvas();

                if (this._attribute && obj && obj.get(this._attribute)) {
                    this._showImage();
                } else {
                    this._hideImage();
                }

                this.set('disabled', obj ? false : true);

                mendix.lang.nullExec(callback);
            },

            _showImage: function() {
                this._image.src = this._mxObject.get(this.dataUrl);

                dojo.replaceClass(this.domNode, 'signature_set', 'signature_unset');
            },

            _hideImage: function() {
                this._image.src = '';

                domClass.replace(this.domNode, 'signature_unset', 'signature_set');
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
                this.connect(this._canvas, (this._touchSupport ? 'touchstart' : 'mousedown'), this._eventMouseDown);
                this.connect(this._reset, 'click', this._eventResetClicked);

                // This prevents the 'dragging image' annoyance when someone tries to
                // draw on the image.
                this.connect(
                    this._image,
                    this._touchSupport ? 'touchstart' : 'mousedown',
                    function(e) {
                        dojo.stopEvent(e);
                        return false;
                    }
                );
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
                this._bezierBuf = [];
                this._handlers = [];

                this._stopTimeout();

                this._context.strokeStyle = this.pencolor;
                this._context.lineJoin    = 'round';
                this._context.lineWidth   = this.pensize;

                this._context.beginPath();

                this._handlers.push(this.connect(window, this._touchSupport ? 'touchmove' : 'mousemove', this._eventMouseMove));
                this._handlers.push(this.connect(window, this._touchSupport ? 'touchend' : 'mouseup', this._eventMouseUp));
            },

            _updateCurve: function(e) {
                var context = this._context,
                    buf = this._bezierBuf,
                    pos = this._getCoords(e),
                    bp = null;

                this._stopTimeout();

                if (this._movedTo) {
                    buf.push(pos);

                    if (buf.length === 4) {
                        bp = this._bezierPoint.apply(this, buf);

                        context.lineTo(bp.x, bp.y);
                        context.stroke();

                        buf.shift();
                        buf[0] = bp;
                    }
                } else {
                    context.moveTo(pos.x, pos.y);
                    this._movedTo = true;
                }
            },

            _endCurve: function() {
                var buf = this._bezierBuf,
                    i = 0,
                    pos = null,
                    j = 0,
                    handlers = null;

                this._stopTimeout();

                // Finish last points in Bezier buffer
                while(buf[i]) {
                    pos = buf[i];
                    this._context.lineTo(pos.x, pos.y);
                    i++;
                }
                this._context.stroke();

                this._bezierBuf = null;

                while(this._handlers[j]){
                    handlers = this._handlers[j];
                    this.disconnect(handlers);
                    j++;
                }

                this._timer = setTimeout(dojo.hitch(this, this._finalizeSignature), this.timeout);
            },

            _eventMouseDown: function(e) {
                dojo.stopEvent(e);

                if (!this.get('disabled')) {
                    this._beginCurve(e);
                }
            },

            _eventMouseMove: function(e) {
                dojo.stopEvent(e);

                this._updateCurve(e);
            },

            _eventMouseUp: function(e) {
                dojo.stopEvent(e);

                this._endCurve();
            },

            _eventResetClicked: function(e) {
                if (!this.get('disabled')) {
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
                this._mxObject.set(this.dataUrl, '');
            },

            _stopTimeout: function() {
                if (this._timer) {
                    clearTimeout(this._timer);
                }
            },

            _finalizeSignature: function() {
                var mxobj = this._mxObject;
                if (mxobj) {
                    if (mxobj.has(this.dataUrl)) {
                        mxobj.set(this.dataUrl, this._canvas.toDataURL());
                    } else {
                        logger.error(this.id + '.finalizeSignature: no dataUrl attribute found.');
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
}());
