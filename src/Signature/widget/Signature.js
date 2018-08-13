require([
    "mxui/widget/_WidgetBase",
    "dijit/_TemplatedMixin",
    "dojo/dom",
    "dojo/dom-construct",
    "dojo/_base/array",
    "dojo/_base/event",
    "dojo/_base/html",
    "dojo/dom-class",
    "dojo/dom-style",
    "dojo/dom-geometry",
    "dojo/touch",
    "dojo/on",
    "dojo/_base/lang",
    "dojo/_base/declare",
    "dojo/text!Signature/widget/templates/Signature.html"
], function(_WidgetBase, _Templated, dom, domConstruct, dojoArray, domEvent, dojoHtml, domClass, domStyle, domGeom, dojoTouch, on, lang, declare, widgetTemplate) {

    return declare("Signature.widget.Signature", [ _WidgetBase, _Templated ], {

        templateString: widgetTemplate,

        _uiCreated: false,
        _smoothingpct: 0.9,

        _mxObject: null,
        _attribute: null,
        _path: null,

        _canvas: null,
        _reset: null,
        _context: null,

        _timer: null,
        _bezierBuf: null,
        _handlers: null,

        postCreate: function() {
            logger.debug(this.id + ".postCreate");
            this._setupWidget();
        },

        startup: function() {
            logger.debug(this.id + ".startup");

            var path = this.dataUrl.split("/");
            this._attribute = path[path.length - 1];
            this._path = path.splice(0, path.length - 1);
        },

        update: function(obj, callback) {
            logger.debug(this.id + ".update");

            if (!this._uiCreated) {
                this._createUI(lang.hitch(this, function () {
                    this.callUpdate(obj, callback);
                }));
            } else {
                this.callUpdate(obj, callback);
            }
        },

        callUpdate: function (obj, callback) {
            logger.debug(this.id + ".callUpdate");
            this.set("disabled", this.readonly);
            if (obj) {

                obj.fetch(this._path, dojo.hitch(this, function(obj) {
                    this._resetSubscriptions(obj);
                    this._updateObject(obj, callback);
                }));
            } else {
                this._updateObject(null, callback);
            }
        },

        enable: function() {
            logger.debug(this.id + ".enable");
            dojo.attr(this._reset, "disabled", false);
            dojo.removeClass(this.domNode, "signhereSignature_disabled");
        },

        disable: function() {
            logger.debug(this.id + ".disable");
            dojo.attr(this._reset, "disabled", true);
            dojo.addClass(this.domNode, "signhereSignature_disabled");
        },

        _setupWidget: function() {
            logger.debug(this.id + "._setupWidget");
            var t = this._smoothingpct,
                u = 1 - t;

            this._bezier1 = t * t * t;
            this._bezier2 = 3 * t * t * u;
            this._bezier3 = 3 * t * u * u;
            this._bezier4 = u * u * u;

            this._bezierBuf = [];
        },

        _resize: function () {
            logger.debug(this.id + "._resize");
            if (this.responsive) {
                var position = domGeom.getContentBox(this.domNode.parentElement),
                    ratio = parseFloat(this.responsiveRatio);

                if (isNaN(ratio)) {
                    ratio = 1.5;
                }

                if (position.w > 0 && this.responsive) {
                    this.domNode.width = position.w;
                } else {
                    this.domNode.width = this.width;
                }

                if (position.h > 0 && this.responsive) {
                    var width = this.domNode.width,
                        height = Math.floor(width / ratio);

                    if (position.h < height) {
                        this.domNode.height = position.h;
                    } else {
                        this.domNode.height = height;
                    }
                } else {
                    this.domNode.height = this.height;
                }

                this._canvas.height = this.domNode.height;
                this._canvas.width = this.domNode.width - 4;
                this._image.height = this.domNode.height;
                this._image.width = this.domNode.width;
                this._reset.width = this.domNode.width;

                this._resetCanvas();
            }
        },

        _createUI: function(callback) {
            logger.debug(this.id + "._createUI");
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
                    "width": this.responsive ? "100%" : (this.width + 4) + "px"
                },
                "innerHTML":  this.resetcaption
            });

            this.domNode.appendChild(this._canvas);
            this.domNode.appendChild(this._image);
            this.domNode.appendChild(this._reset);

            //domStyle.set(this.domNode, sizeProperties);

            this._context = this._canvas.getContext("2d");

            this._resize();
            this._setupEvents();

            this._uiCreated = true;
            if (typeof callback === "function") {
                callback();
            }
        },

        _updateObject: function(obj, callback) {
            logger.debug(this.id + "._updateObject");
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
            logger.debug(this.id + "._showImage");
            this._image.src = this._mxObject.get(this.dataUrl);

            dojo.replaceClass(this.domNode, "signature_set", "signature_unset");
        },

        _hideImage: function() {
            logger.debug(this.id + "._hideImage");
            this._image.src = "";

            domClass.replace(this.domNode, "signature_unset", "signature_set");
        },

        _drawGrid: function() {
            logger.debug(this.id + "._drawGrid");
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
            logger.debug(this.id + "._setupEvents");
            on(this._canvas, dojoTouch.press, lang.hitch(this, this._beginCurve));
            on(this._reset, "click", lang.hitch(this, this._eventResetClicked));

            if (this.responsive) {
                this.connect(this.mxform, "resize", lang.hitch(this, this._resize));
            }

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
            logger.debug(this.id + "._eventResetClicked");
            if (!this.get("disabled")) {
                this._resetMxObject();
                this._resetCanvas();

                this._hideImage();
            }
        },

        _resetCanvas: function() {
            logger.debug(this.id + "._resetCanvas");
            this._context.clearRect(0, 0, this._canvas.width, this._canvas.height);

            this._bezierBuf = [];

            this._drawGrid();

            this._clearValidations();
        },

        _resetMxObject: function() {
            logger.debug(this.id + "._resetMxObject");
            this._mxObject.set(this.dataUrl, "");
        },

        _stopTimeout: function() {
            if (this._timer) {
                clearTimeout(this._timer);
            }
        },

        _finalizeSignature: function() {
            logger.debug(this.id + "._finalizeSignature");
            if (this._mxObject) {
                if (this._mxObject.has(this.dataUrl)) {
                    this._mxObject.set(this.dataUrl, this._canvas.toDataURL());
                    if(this.onChangeNf){
                        this._execNf(this.onChangeNf);
                    }else if(this.onChangeMF){
                        this._execMf(this.onChangeMf);
                    }
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
            logger.debug(this.id + "._setDisabledAttr");
            var isDisabled = this.readonly ||
                !this._mxObject ||
                !this._attribute ||
                this._mxObject.isReadonlyAttr(this._attribute) ||
                value;
            return this.inherited(arguments, [ isDisabled ]);
        },

        _unsubscribe: function () {
          if (this._handles) {
              dojoArray.forEach(this._handles, function (handle) {
                  mx.data.unsubscribe(handle);
              });
              this._handles = [];
          }
        },

        // Reset subscriptions.
        _resetSubscriptions: function(obj) {
            logger.debug(this.id + "._resetSubscriptions");
            // Release handles on previous object, if any.
            this._unsubscribe();

            // When a mendix object exists create subscribtions.
            if (obj) {
                var validationHandle = mx.data.subscribe({
                    guid: obj.getGuid(),
                    val: true,
                    callback: lang.hitch(this, this._handleValidation)
                });

                this._handles = [ validationHandle ];
            }
        },

        // Handle validations.
        _handleValidation: function(validations) {
            logger.debug(this.id + "._handleValidation");
            this._clearValidations();

            var validation = validations[0],
                message = validation.getReasonByAttribute(this.dataUrl);

            if (this._readOnly) {
                validation.removeAttribute(this.dataUrl);
            } else if (message) {
                this._addValidation(message);
                validation.removeAttribute(this.dataUrl);
            }
        },

        // Clear validations.
        _clearValidations: function() {
            logger.debug(this.id + "._clearValidations");
            domConstruct.destroy(this._alertDiv);
            this._alertDiv = null;
        },

        // Show an error message.
        _showError: function(message) {
            logger.debug(this.id + "._showError");
            if (this._alertDiv !== null) {
                dojoHtml.set(this._alertDiv, message);
                return true;
            }
            this._alertDiv = domConstruct.create("div", {
                "class": "alert alert-danger",
                "innerHTML": message
            });
            domConstruct.place(this._alertDiv, this.domNode);
        },

        // Add a validation.
        _addValidation: function(message) {
            logger.debug(this.id + "._addValidation");
            this._showError(message);
        },

        _execMf: function (mf) {
            if (mf) {
                mx.data.action({
                    params: {
                        actionname: mf
                    },
                    store: {
                        caller: this.mxform
                    },
                    callback: lang.hitch(this, function () {
                        //ok
                    }),
                    error: function (error) {
                        console.error(error.description);
                    }
                }, this);
            }
        },

        _execNf: function (nf) {
            if (nf) {
                mx.data.callNanoflow({
                    nanoflow: nf,
                    orgin: this.mxform,
                    context:this.mxcontext,
                    callback: lang.hitch(this, function () {
                        //ok
                    }),
                    error: function (error) {
                        console.error(error.description);
                    }
                });
            }
        },




    });
});
