//     controls.js
//     UI framework, code generation tool
//     status: proposal, example, valid prototype, under development
//     demo:   http://aplib.github.io/controls.js/
//     issues: https://github.com/aplib/controls.js/issues
//     (c) 2013 vadim b.
//     License: MIT

(function() { 'use strict';

    var controls = {
        VERSION: '0.7.04'/*#.#.##*/,
        id_generator: 53504,
        // assignable default template engine
        //template: function(templ) { return new Function('return \'' + templ.replace('\n', '\\\n').replace(/'/g, "\\'") + '\''); },
        template: function(templ) {
            return new Function('return \'' + templ.replace(/'|\n/g, function(substr) {
                return {"'":"\\'", "\n":"\\n\\\n"}[substr];
            }) + '\'');
        },
        subtypes: {} // Registered subtypes
    };
    
    var IDENTIFIERS = ',add,_add,attach,attr,_attr,attrs,attributes,class,controls,data,delete,each,element,findFirst,findLast,first,forEach,id,insert,_insert,__type,last,length,name,parameters,parent,refresh,remove,style,template,';
    var ENCODE_HTML_MATCH = /&(?!#?\w+;)|<|>|"|'|\//g;
    var ENCODE_HTML_PAIRS = { "<": "&#60;", ">": "&#62;", '"': '&#34;', "'": '&#39;', "&": "&#38;", "/": '&#47;' };
    var DECODE_HTML_MATCH = /&#(\d{1,8});/g;    
    
    /**
     * Initialize control object
     * 
     * @param {object} object Control object
     * @param {string} __type Base type of the control, in format namespace.control
     * @param {object} parameters Parameters hash object
     * @param {object} attributes Attributes hash object
     * @param {function} outer_template Outer template
     * @param {function} inner_template Inner template
     * @returns {object} Control object
     */
    controls.controlInitialize = function(object, __type, parameters, attributes, outer_template, inner_template) {
        
        if (attributes) {
            object.id = attributes.id || (attributes.id = (++controls.id_generator).toString(16)); // set per session uid
            object.name = attributes.$name;
            
            // default move $prime to $text
            if ('$prime' in attributes) {
                var prime = attributes.$prime;
                if (prime instanceof DataArray || prime instanceof DataObject)
                    this.bind(prime);
                else
                    attributes.$text = prime;
                delete attributes.$prime;
            }
            object.attributes = attributes;
        } else
            object.attributes = {id:(object.id = (++controls.id_generator).toString(16))}; // set per session uid
        
        object.__type       = (__type.indexOf('.') >= 0) ? __type : ('controls.' + __type);
        object.parameters   = parameters || {};
        object.controls     = [];   // Collection of child nodes
        
        if (outer_template) {
            outer_template.no_serialize = true;
            Object.defineProperty(object, 'outer_template', {
                enumerable: true, writable: true,
                value: outer_template
            });
        }
        if (inner_template) {
            inner_template.no_serialize = true;
            Object.defineProperty(object, 'inner_template', {
                enumerable: true, writable: true,
                value: inner_template
            });
        }
    
        return object;
    };
    
    /**
     * Register control constructor in the controls library
     * 
     * @param {string} type Type of the control
     * @param {function} constructor Control constructor function
     * @param {function} revive Control revive function
     * @returns {undefined}
     */
    controls.typeRegister = function(type, constructor, revive) {
        controls.factoryRegister(type, constructor);
        constructor.is_constructor = true;
        constructor.revive = revive;
    };
    
    /**
     * Register control factory function in the controls library
     * 
     * @param {string} type Type of the control
     * @param {function} factory Control factory function
     * @returns {undefined}
     */
    controls.factoryRegister = function(type, factory) {
        var key_parameters = {},
            __type = parse_type(type, key_parameters) .toLowerCase();
        
        // normalize prop name, remove lead '/'
        for(var prop in key_parameters)
        if (prop[0] === '/') {
            key_parameters[prop.slice(1)] = key_parameters[prop];
            delete key_parameters[prop];
        }
        
        if (__type.length < type.length || Object.keys(key_parameters).length) {
            // type is subtype with parameters, register to controls.subtypes
            key_parameters.__ctr = factory;
            var subtypes_array = controls.subtypes[__type] || (controls.subtypes[__type] = []);
            subtypes_array.push(key_parameters);
        } else {
            // register as standalone type
            // check name conflict
            if (controls[__type])
                throw new TypeError('Type ' + type + ' already registered!');
            
            controls[__type] = factory;
        }
    };
    
    /**
     * Register existing parameterized type as a standalone type
     * 
     * @param {string} alias New alias that will be registered, in format namespace.control
     * @param {string} type Existing base type + additional #parameters, in format existingtype#parameters
     * @returns {undefined}
     */
    controls.typeAlias = function(alias, type) {
        var parameters = {},
            __type = parse_type(type, parameters) .toLowerCase(),
            constructor = resolve_ctr(__type, parameters);
        if (!constructor)
            throw new TypeError('Type ' + __type + ' not registered!');
            
        controls[alias.toLowerCase()] = { __type: __type, parameters: parameters, isAlias: true };
    };
    
    controls.parse = function(text) {
        try {
            return JSON.parse(text) || {};
        } catch(e) { console.log(e); }
        return {};
    };
    
    
// >> Events
    
    /**
     * Force events collection and event object
     * 
     * @param {object} object Object owns a collection of events
     * @param {string} type Type of event
     * @param {boolean} capture Capture event flag
     * @returns {controls.Event} Collection of a specified type
     */
    function force_event(object, type, capture) {
        var events = object.events || (object.events = {}),
            key = (capture) ? ('#'/*capture*/ + type) : type,
            event = events[key];
        if (!event) {
            events[key] = event = new controls.Event(object, type, capture);

            // add DOM listener if attached
            if (event.is_dom_event) {
                var element = object._element;
                if (element)
                    element.addEventListener(type, event.raise, capture);
            }
        }
        return event;
    };

    var dom_events =
',change,DOMActivate,load,unload,abort,error,select,resize,scroll,blur,DOMFocusIn,DOMFocusOut,focus,focusin,focusout,\
click,dblclick,mousedown,mouseenter,mouseleave,mousemove,mouseover,mouseout,mouseup,wheel,keydown,keypress,keyup,oncontextmenu,\
compositionstart,compositionupdate,compositionend,DOMAttrModified,DOMCharacterDataModified,DOMNodeInserted,\
DOMNodeInsertedIntoDocument,DOMNodeRemoved,DOMNodeRemovedFromDocument,DOMSubtreeModified,';
    
    controls.Event = function(default_call_this, type, capture, listeners_data) {
        var listeners = this.listeners = [],
            call_this = this.call_this = default_call_this; // owner of the event object
        this.type = type;
        this.capture = capture;
        this.is_dom_event = (dom_events.indexOf(',' + type + ',') >= 0);
        
        // revive from JSON data
        if (listeners_data)
        for(var i = 0, c = listeners_data.length; i < c; i+=2) {
            listeners.push(listeners_data[i]);
            var c_this =  listeners_data[i+1];
            listeners.push((c_this === call_this) ? null : call_this);
        }

        this.raise = function() {
            for(var i = 0, c = listeners.length; i < c; i+=2)
                listeners[i].apply(listeners[i+1] || call_this, arguments);
        };
    };
    controls.Event.prototype = {
        addListener: function(call_this/*optional*/, listener) {
            if (arguments.length > 1)
                this.listeners.push(listener, (call_this === this.call_this) ? null : call_this);
            else
                this.listeners.push(call_this, null);
        },

        removeListener: function(listener) {
            var listeners = this.listeners,
                index = listeners.indexOf(listener);
            if (index >= 0)
                listeners.splice(index, 2);
        },
        clear: function() {
            this.listeners.length = 0;
        },
        toJSON: function() {
            var jsonlisteners = [],
                listeners = this.listeners;
            // Serialize listeners
            for(var i = 0, c = listeners.length; i < c; i+=2) {
                var event_func = listeners[i];
                if (!event_func.no_serialize) {
                    jsonlisteners.push(extract_func_code(event_func));
                    // call_this not serialize
                    jsonlisteners.push(null);
                }
            }
            return {type:this.type, capture:this.capture, listeners:jsonlisteners};
        }
    };
    
    // Post processing
    var post_events = [];
    setInterval(function() {
        if (post_events.length > 0)
        for(var i = 0, c = post_events.length; i < c; i++) {
            try {
                post_events[i].post_event.raise();
            }
            catch(e) { console.log(e); }
            
            post_events.length = 0;
        };
    }, 30);
    
// >> Data objects
    
    var data_object_common = {
        listen: function(call_this/*optional*/, listener) {
            var event = this.event || (this.event = new controls.Event(this));
            event.addListener.apply(event, arguments);
            return this;
        },
        listen_: function(call_this/*optional*/, listener) {
            if (typeof listener === 'function')
                listener.no_serialize = true;
            else
                call_this.no_serialize = true;
            return this.listen.apply(this, arguments);
        },
        removeListener: function(listener) {
            var event = this.event;
            if (event)
                event.removeListener(listener);
            return this;
        },
        subscribe: function(call_this/*optional*/, listener) {
            if (typeof(call_this) === 'function') {
                listener = call_this;
                call_this = this;
            }
            
            if (!listener)
                return this;
            
            var post_event = this.post_event || (this.post_event = new controls.Event(this));
            post_event.addListener.apply(post_event, arguments);
            
            return this;
        },
        unsubscribe: function(listener) {
            var post_event = this.post_event;
            if (post_event)
                post_event.removeListener(listener);
            return this;
        },
        raise: function() {
            var event = this.event;
            if (event)
                event.raise.apply(this, arguments);
            
            var post_event = this.post_event;
            if (post_event) {
                var index = post_events.indexOf(this);
                if (index < 0 || index !== post_events.length - 1) {
                    if (index >= 0)
                        post_events.splice(index, 1);
                    post_events.push(this);
                }
            }
        },
        set: function(name, value) {
            this.state_id++;
            this[name] = value;
            this.last_name = name;
            this.raise();
        },
        setx: function(collection) {
            var modified;
            for(var prop in collection)
            if (collection.hasOwnProperty(prop)) {
                modified = true;
                this.state_id++;
                this[prop] = collection[prop];
                this.last_name = collection;
            }
            if (modified)
                this.raise();
        }
    };
    
    function DataObject(parameters, attributes) {
        this.state_id = Number.MIN_VALUE;
    }
    DataObject.prototype = data_object_common;
    controls.typeRegister('DataObject', DataObject);
    
    var data_array_common = {
        // ops: 1 - insert, 2 - remove, ...
        push: function(item) {
            var proto = Object.getPrototypeOf(this);
            for(var i = 0, c = arguments.length; i < c; i++)
                proto.push.call(this, arguments[i]);
            this.state_id += c;
            this.last_operation = 1;
            this.last_index = this.length - 1;
            this.raise(this);
        }
        // TODO
    };
        
    function LocalStorageAdapter(parameters, attributes) {
    };
    LocalStorageAdapter.prototype = {
        raise: function(type) {}
    };
    controls.typeRegister('LocalStorage', LocalStorageAdapter);
    
    // DataArray
    // 
    // Parameters:
    // adapter {string} - registered type
    // Attributes:
    // data - an array of values for the initial filling of the data array
    //
    // No!Brrr! TODO this
    function DataArray(parameters, attributes) { // factory method
        var array = [];
        
        if (attributes) {
            // $data
            var data = attributes.$data;
            if (data)
                for(var i = 0, c = data.length; i < c; i++)
                    array[i] = data[i];
        }
        
        for(var prop in data_object_common)
        if (data_object_common.hasOwnProperty(prop))
            array[prop] = data_object_common[prop];
    
        for(var prop in data_array_common)
        if (data_array_common.hasOwnProperty(prop))
            array[prop] = data_array_common[prop];
        
        array.state_id       = Number.MIN_VALUE;   // Value identifying the state of the object is incremented each state-changing operation
        array.last_operation = 0;                  // Last state-changing operation
        array.last_changed   = undefined;          // Last changed property name or index
        
        if (parameters && parameters.adapter)
        if (!(this.adapter = controls.create(parameters.adapter)))
            throw new TypeError('Invalid data adapter type "' + parameters.adapter + '"!');
        
        return array;
    }
    controls.factoryRegister('DataArray', DataArray);
    
// >> Controls prototype
    
    controls.control_prototype = new function() {
        
        this.initialize = function(__type, parameters, _attributes, outer_template, inner_template) {
            return controls.controlInitialize(this, __type, parameters, _attributes, outer_template, inner_template);
        };
        
        function setParent(value, index) {
            var parent = this._parent;
            if (value !== parent) {
                this._parent = value;
                var name = this._name;
                
                if (parent) {
                    var parent_controls = parent.controls,
                        index = parent_controls.indexOf(this);
                    if (index >= 0)
                        parent_controls.splice(index, 1);
                    
                    if (name && parent.hasOwnProperty(name) && parent[name] === this)
                        delete parent[name];
                }
                
                if (value) {
                    var value_controls = value.controls;

// profiling: very expensive operation
//                    var index = value_controls.indexOf(this);
//                    if (index >= 0)
//                        parent_controls.splice(index, 1);
                    if (index === undefined)
                        value_controls.push(this);
                    else
                        value_controls.splice(index, 0, this);
                    
                    if (name)
                        value[name] = this;
                }
                
                this.raise('parent', value);
            }
        }
        
        Object.defineProperties(this, {
            // name of the control in parent collection
            name: {
                enumerable: true, 
                get: function() { return this._name; },
                set: function(value) {
                    if (IDENTIFIERS.indexOf(',' + value + ',') >= 0)
                        throw new SyntaxError('Invalid name "' + value + '"!');

                    var name = this._name;
                    if (value !== name) {
                        this._name = value;

                        var parent = this._parent;
                        if (parent) {
                            if (name && parent.hasOwnProperty(name) && parent[name] === this)
                                delete parent[name];

                            if (value)
                                parent[value] = this;
                        }
                    }
                }
            },
            // The associated element of control
            element: {
                enumerable: true,
                get: function() { return this._element; },
                set: function(attach_to_element) {
                    var element = this._element;
                    if (attach_to_element !== element) {
                        this._element = attach_to_element;

                        var events = this.events;
                        if (events)
                        for(var event_type in events) {
                            var event = events[event_type];
                            if (event.is_dom_event) {
                                // remove event raiser from detached element
                                if (element)
                                    element.removeEventListener(event.type, event.raise, event.capture);
                                // add event raiser as listener for attached element
                                if (attach_to_element)
                                    attach_to_element.addEventListener(event.type, event.raise, event.capture);
                            }
                        }
                        this.raise('element', attach_to_element);
                    }
                }
            },
            parent: {
                enumerable: true,
                get: function() { return this._parent; },
                set: setParent
            },
            wrapper: {
                enumerable: true,
                get: function() { return this._wrapper; },
                set: function(value) {
                    var wrapper = this._wrapper;
                    if (value !== wrapper) {
                        this._wrapper = value;

                        if (wrapper) {
                            var wrapper_controls = wrapper.controls;
                            var index = wrapper_controls.indexOf(this);
                            if (index >= 0)
                                wrapper_controls.splice(index, 1);
                        }

                        if (value) {
                            var value_controls = value.controls;

        // profiling: indexOf very expensive operation
        //                    var index = value_controls.indexOf(this);
        //                    if (index >= 0)
        //                        wrapper_controls.splice(index, 1);

                            value_controls.push(this);
                        }
                    }
                }
            },
            length: {
                enumerable: true,
                get: function() {
                    return this.controls.length;
                }
            }
        });
        
        this.find = function(selector, by_attrs, recursive) {
            if (arguments.length < 3)
                recursive = true;
            var controls = this.controls,
                result = [];
            if (typeof selector === 'object' || typeof by_attrs === 'object') {
                for(var i = 0, c = controls.length; i < c; i++) {
                    var control = controls[i];
                    
                    // by properties
                    if (selector)
                    for(var prop in selector)
                    if (selector.hasOwnProperty(prop)) {
                        if (control[prop] === selector[prop])
                            result.push(control);
                        // by attributes
                        else if (by_attrs) {
                            var attributes = control.attributes;
                            for(var prop in by_attrs)
                            if (by_attrs.hasOwnProperty(prop) && attributes[prop] === by_attrs[prop])
                                result.push(control);
                        } else if (recursive) {
                        // find recursively
                            var finded = control.find(selector, by_attrs, recursive);
                            if (finded.length)
                                result.push.apply(result, finded);
                        }
                    }
                }
            } else if (!selector) {
                return controls[0];
            } else if (typeof selector === 'string') {
                return callWithSelector.call(this, this.find, selector);
            } else if (typeof selector === 'function') {
                for(var i = 0, c = controls.length; i < c; i++) {
                    var control = controls[i];
                    if (selector(control))
                        result.push(control);
                    // find recursively
                    else if (recursive) {
                        var finded = control.find(selector, by_attrs, recursive);
                        if (finded.length)
                            result.push.apply(result, finded);
                    }
                }
            }
        };
        
        this.select = function(selector, by_attrs) {
            return this.find(selector, by_attrs, false);
        };
                
        this.first = function(selector, by_attrs) {
            return this.findFirst(selector, by_attrs, false);
        };
        
        /**
         * 
         * @param {string,function} selector (string) format name:type`class#id, (object) Control property values for comparing
         * @param {type} attrs Control attribute values for comparing
         * @returns {object} matched control
         */
        this.findFirst = function(selector, by_attrs, recursive) {
            if (arguments.length < 3)
                recursive = true;
            var controls = this.controls;
            if (typeof selector === 'object' || typeof by_attrs === 'object') {
                for(var i = 0, c = controls.length; i < c; i++) {
                    var control = controls[i];
                    
                    // by properties
                    if (selector)
                    for(var prop in selector)
                    if (selector.hasOwnProperty(prop) && control[prop] === selector[prop])
                        return control;
            
                    // by attributes
                    if (by_attrs) {
                        var attributes = control.attributes;
                        for(var prop in by_attrs)
                        if (by_attrs.hasOwnProperty(prop) && attributes[prop] === by_attrs[prop])
                            return control;
                    }
                    
                    // find recursively
                    if (recursive) {
                        var finded = control.findFirst(selector, by_attrs, recursive);
                        if (finded)
                            return finded;
                    }
                }
            } else if (!selector) {
                return controls[0];
            } else if (typeof selector === 'string') {
                return callWithSelector.call(this, this.findFirst, selector);
            } else if (typeof selector === 'function') {
                for(var i = 0, c = controls.length; i < c; i++) {
                    var control = controls[i];
                    if (selector(control))
                        return control;
                    // find recursively
                    if (recursive) {
                        var finded = control.findFirst(selector, by_attrs, recursive);
                        if (finded)
                            return finded;
                    }
                }
            }
        };
        
        this.last = function(selector, by_attrs) {
            return this.findLast(selector, by_attrs, false);
        };
        
        this.findLast = function(selector, by_attrs, recursive) {
            if (arguments.length < 3)
                recursive = true;
            var controls = this.controls;
            if (typeof selector === 'object' || typeof by_attrs === 'object') {
                for(var i = controls.length - 1; i >= 0; i--) {
                    var control = controls[i];
                    
                    // by properties
                    if (selector)
                    for(var prop in selector)
                    if (selector.hasOwnProperty(prop) && control[prop] === selector[prop])
                        return control;
                
                    // by attributes
                    if (by_attrs) {
                        var attributes = control.attributes;
                        for(var prop in by_attrs)
                        if (by_attrs.hasOwnProperty(prop) && attributes[prop] === by_attrs[prop])
                            return control;
                    }
                    
                    // find recursively
                    if (recursive) {
                        var finded = control.findLast(selector, by_attrs, recursive);
                        if (finded)
                            return finded;
                    }
                }
            } else if (!selector) {
                return controls[0];
            } else if (typeof selector === 'string') {
                return callWithSelector.call(this, this.findLast, selector);
            } else if (typeof selector === 'function') {
                for(var i = controls.length - 1; i >= 0; i--) {
                    var control = controls[i];
                    if (selector(control))
                        return control;
                    // find recursively
                    if (recursive) {
                        var finded = control.findLast(selector, by_attrs, recursive);
                        if (finded)
                            return finded;
                    }
                }
            }
        };
        
        function callWithSelector(method, selector) {
            // name:...
            var name, type = selector, colonpos = selector.indexOf(':');
            if (colonpos >= 0) {
                name = selector.substr(0, colonpos);
                type = selector.substr(colonpos + 1);
            }
            // `...
            var clss, gravepos = type.indexOf('`');
            if (gravepos >= 0) {
                type = selector.substr(0, gravepos);
                clss = selector.substr(gravepos + 1);
            }
            // #...
            var num, numpos = type.indexOf('#');
            if (numpos >= 0) {
                type = selector.substr(0, numpos);
                num = selector.substr(numpos + 1);
            }
            
            if (type && type.indexOf('.') < 0)
                type = 'controls.' + type;
            
            var by_props, by_attrs;
            if (type)   (by_props || (by_props = {})).__type = type;
            if (name)   (by_props || (by_props = {})).name = name;
            if (clss)   (by_attrs || (by_attrs = {})).class = clss;
            return method.call(this, by_props, by_attrs);
        }
        
        
        
        // default html template
        this.outer_template = function(it) { return '<div' + it.printAttributes() + '>' + (it.attributes.$text || '') + it.printControls() + '</div>'; };
        controls.default_outer_template = this.outer_template;
        // default inner html template
        this.inner_template = function(it) { return (it.attributes.$text || '') + it.printControls(); };
        controls.default_inner_template = this.inner_template;
        // default inline template
        this.outer_inline_template = function(it) { return '<span' + it.printAttributes() + '>' + (it.attributes.$text || '') + it.printControls() + '</span>'; };
        controls.default_outer_inline_template = this.outer_inline_template;

        // snippets:
        // 
        // {{? it.attributes.$icon }}<span class="{{=it.attributes.$icon}}"></span>&nbsp;{{?}}
        // {{? it.attributes.$text }}{{=it.attributes.$text}}{{?}}
        // include list of subcontrols html:
        // {{~it.controls :value:index}}{{=value.wrappedHTML()}}{{~}}

        this.innerHTML = function() {
            // assemble html
            return this.inner_template(this);
        };
        
        this.outerHTML = function() {
            // assemble html
            return this.outer_template(this);
        };
        
        this.wrappedHTML = function() {
            var wrapper = this._wrapper;
            return (wrapper) ? wrapper.wrappedHTML() : this.outerHTML();
        };
        
        // set template text or template function
        this.template = function(outer_template, inner_template) {
            if (outer_template) {
                if (typeof outer_template === 'string')
                    outer_template = controls.template(outer_template);
                if (!this.hasOwnProperty("outer_template"))
                    Object.defineProperty(this, "outer_template", { configurable:true, enumerable:true, writable:true, value:outer_template });
                else
                    this.outer_template = outer_template;
            }
            if (inner_template) {
                if (typeof outer_template === 'string')
                    inner_template = controls.template(inner_template);
                if (!this.hasOwnProperty("inner_template"))
                    Object.defineProperty(this, "inner_template", { configurable:true, enumerable:true, writable:true, value:inner_template });
                else
                    this.inner_template = inner_template;
            }
            return this;
        };
        
        this.toJSON = function() {
            var json = {
                __type: this.type(),
                attributes: this.attributes
            };
            
            var name = this.name;
            if (name)
                json.name = name;
            
            var ctrls = this.controls;
            if (ctrls.length)
                json.controls = ctrls;
            
            if (this.hasOwnProperty('outer_template')) {
                var outer_template = this.outer_template;
                if (!outer_template.no_serialize)
                    json.outer_template = extract_func_code(this.outer_template);
            }
            if (this.hasOwnProperty('inner_template')) {
                var inner_template = this.outer_template;
                if (!inner_template.no_serialize)
                    json.inner_template = extract_func_code(this.inner_template);
            }
            
            var events = this.events;
            if (events) {
                var jevents = [];
                for(var prop in events)
                if (events.hasOwnProperty(prop)) {
                    var event = events[prop],
                        listeners = event.listeners,
                        serialize = false;
                    for(var i = 0, c = listeners.length; i < c; i+=2)
                        if (!listeners[i].no_serialize) {
                            serialize = true;
                            break;
                        }
                    if (serialize)
                        jevents.push(event);
                }
                if (jevents.length)
                    json.events = jevents;
            }
            return json;
        };
        
        // TODO: remove excess refresh calls
        this.refresh = function() {
            var element = this._element;
            if (element) {
                if (!element.parentNode) {
                    // orphaned element
                    this._element = undefined;
                } else {
                    try {
                        // Setting .outerHTML breaks hierarchy DOM, so you need a complete re-initialisation bindings to DOM objects.
                        // Remove wherever possible unnecessary calls .refresh()

                        var html = this.outerHTML();
                        if (html !== element.outerHTML) {
                            this.detachAll();
                            element.outerHTML = html;
                            this.attachAll();
                        }
                    }
                    catch (e) {
                        // Uncaught Error: NoModificationAllowedError: DOM Exception 7
                        //  1. ? xml document
                        //  2. ? "If the element is the root node" ec orphaned element
                        this._element = undefined;
                    }
                }
            }
            return this;
        };
        
        this.refreshInner = function() {
            var element = this._element;
            if (element)
                element.innerHTML = this.innerHTML();
            return this;
        };
        
        // Attach to DOM element
        this.attach = function(some) {
            this.element = (!arguments.length)
                ? document.getElementById(this.id)
                : (typeof(some) === 'string') ? document.getElementById(some) : (some && (some._element || some));
            return this;
        };
        
        // Attach this and all nested controls to DOM by id
        this.attachAll = function() {
            if (!this._element)
                this.element = document.getElementById(this.id);
            for(var ctrls = this.controls, i = 0, c = ctrls.length; i < c; i++)
                ctrls[i].attachAll();
            return this;
        };
        
        // Detach from DOM
        this.detach = function() {
            this.element = undefined;
            return this;
        };
        
        // Detach this and all nested from DOM
        this.detachAll = function() {
            this.element = undefined;
            for(var ctrls = this.controls, i = 0, c = ctrls.length; i < c; i++)
                ctrls[i].detachAll();
            return this;
        };
        
        // Replace control in the hierarchy tree
        this.replaceItself = function(control) {
            var controls = this.controls;

            // .controls may be a DataArray
            for(var i = controls.length - 1; i >= 0; i--)
                control.add(controls.shift());
            
            var parent = this.parent;
            if (!parent)
                control.parent = undefined;
            else {
                var index = parent.controls.indexOf(this);
                this.parent = undefined;
                setParent.call(control, parent, index);
            }
            var element = this._element;
            if (!element)
                control.element = undefined;
            else {
                control.element = element;
                control.refresh(); // rewrite dom
            }
        };
        
        // opcode {number} - 0 - insert before end, 1 - insert after begin, 2 - insert before, 3 - insert after
        this.createElement = function(node, opcode) {
            var element = this._element,
                parent = this.parent;
        
            if (element)
                throw new TypeError('Element already exists!');
            
            if (!node && parent) {
                node = parent.element;
                opcode = 0;
            }
            
            if (node && '__type' in node)
                node = node.element;
            
            if (!node)
                throw new TypeError('Failed to create element!');
            
            if (node.insertAdjacentHTML) {
                var pos;
                switch(opcode) {
                    case 1: pos = 'afterbegin'; break;
                    case 2: pos = 'beforebegin'; break;
                    case 3: pos = 'afterend'; break;
                    default: pos = 'beforeend';
                }
                // illegal invocation on call this method before element completed
                node.insertAdjacentHTML(pos, this.outerHTML());
                
            } else {

                var fragment = document.createDocumentFragment(),
                    el = document.createElement('div');
                el.innerHTML = this.outerHTML();
                var buf = Array.prototype.slice.call(el.childNodes);
                for(var i = 0, c = buf.length; i < c; i++)
                    fragment.appendChild(buf[i]);

                switch(opcode) {
                    case 1:
                        (node.childNodes.length === 0) ? node.appendChild(fragment) : node.insertBefore(node.firstChild, fragment);
                        break;
                    case 2:
                        var nodeparent = node.parentNode;
                        if (nodeparent)
                            nodeparent.insertBefore(fragment, node);
                        break;
                    case 3:
                        var nodeparent = node.parentNode;
                        if (nodeparent) {
                            var next_node = node.nextSibling;
                            if (next_node)
                                nodeparent.insertBefore(fragment, next_node);
                            else
                                nodeparent.appendChild(fragment);
                        }
                        break;
                    default:
                        node.appendChild(fragment);
                }
            }
            return this.attachAll();
        };
        
        this.deleteElement = function() {
            var element = this._element;
            if (element) {
                this.detachAll();
                var parent_node = element.parentNode;
                if (parent_node)
                    parent_node.removeChild(element);
                this._element = undefined;
            }
            return this;
        };
        
        this.deleteAll = function() {
            this.deleteElement();
            for(var ctrls = this.controls, i = ctrls.length - 1; i >= 0; i--)
                ctrls[i].deleteAll();
            return this;
        };
        
        /**
         * Add event listener.
         * 
         * @param {string} type Event type. Event type may be DOM event as "click" or special control event as "type".
         * @param {object} [call_this] The value to be passed as the this parameter to the target function when the event handler function is called.
         * @param {function} listener Event handler function.
         * @param {boolean} [capture] This argument will be passed to DOM.addEventListener(,, useCapture).
         * @returns Returns this.
         */
        this.on = this.listen = function(type, /*optional*/ call_this, listener, /*optional*/ capture) {
            if (typeof(call_this) === 'function') {
                capture = listener;
                listener = call_this;
                call_this = null;
            }
            if (type && listener)
                force_event(this, type, capture)
                    .addListener(call_this, listener);
            return this;
        };
        
        // set listener and check listener as no_serialize
        this.on_ = this.listen_ = function(type, call_this, listener, capture) {
            if (typeof(call_this) === 'function') {
                capture = listener;
                listener = call_this;
                call_this = null;
            }
            if (type && listener) {
                force_event(this, type, capture)
                    .addListener(call_this, listener);
                listener.no_serialize = true;
            }
            return this;
        };
        
        // Alias for listen()
        this.addListener = function(type, call_this/*optional*/, listener, capture) {
            return this.listen(type, call_this, listener, capture);
        };
        
        /**
         * Remove event listener.
         * 
         * @param {string} type Event type.
         * @param {function} listener Event handler function.
         * @param [capture] This argument will be passed to DOM.removeEventListener(,, useCapture).
         * @returns Returns this.
         */
        this.removeListener = function(type, listener, capture) {
            if (type && listener)
                force_event(this, type, capture).removeListener(listener);
            return this;
        };
        
        /**
         * Raise event.
         * 
         * @param {string} type Event type.
         * @param Arbitrary number of arguments to be passed to handlers.
         * @returns Returns this.
         */
        this.raise = function(type) {
            var events = this.events;
            if (type && events) {
                var capture_event = events['#' + type],
                    event = events[type],
                    args = Array.prototype.slice.call(arguments, 1);
            
                if (capture_event)
                    capture_event.raise.apply(this, args);

                if (event)
                    event.raise.apply(this, args);
            }
            return this;
        };
        
        this.parameter = function(name, value) {
            var parameters = this.parameters;
            
            if (arguments.length <= 1)
                return parameters[name] || parameters['/'+name];
            
            if (value !== parameters[name]) {
                parameters[name] = value;
                this.refresh();
            }
        };
        
        this._parameter = function(name, value) {
            this.parameter(name, value);
            return this;
        };
        
        // set attribute value
        this.attr = function(name, value) {
            var attributes = this.attributes;
            
            if (arguments.length === 0)
                return undefined;
            
            if (arguments.length === 1)
                return attributes[name];
            
            if (value !== attributes[name]) {
                attributes[name] = value;
                
                if (this._element)
                    this.refresh();
            }
        };
        
        this._attr = function(name, value) {
            this.attr(name, value);
            return this;
        };
        
        // set attributes
        this.attrs = function(_attributes) {
            var attributes = this.attributes;
            
            if (arguments.length > 0) {
                var updated = false;

                for(var prop in _attributes)
                if (_attributes.hasOwnProperty(prop)) {
                    var value = _attributes[prop];
                    if (value !== attributes[prop]) {
                        attributes[prop] = value;
                        updated = true;
                    }
                }

                if (updated && this._element)
                    this.refresh();
            }
            return attributes;
        };
        
        this._attrs = function(_attributes) {
            this.attrs(_attributes);
            return this;
        };
        
        // get/set path.type/parameters
        this.type = function(type, apply_inherited) {
            // >> get type
            
            if (!arguments.length) {
                var inheritable = '', unheritable = '', parameters = this.parameters;
                for(var prop in parameters)
                if (parameters.hasOwnProperty(prop)) {
                    var value = parameters[prop];
                    if (typeof value === 'boolean' && value)
                        value = '';
                    else  {
                        if (typeof value !== 'string')
                            value = String(value);
                        value = ((value.indexOf(' ') >= 0) ? ('="' + value + '"') : ('=' + value));
                    }
                    if (prop[0] === '/') {
                        // inheritable parameters
                        if (inheritable) inheritable += ' ';
                        inheritable += prop.substr(1) + value;
                    } else {    
                        // not inheritable parameters
                        if (unheritable) unheritable += ' ';
                        unheritable += prop + value;
                    }
                }
                
                var type = this.__type;
                if (unheritable)
                    type += ' ' + unheritable;
                if (inheritable)
                    type += '/' + inheritable;

                return type;
            }
            
            // << get type
            
            // >> set type and parameters
            
            var parameters = this.parameters; // rebuild parameters
            for(var prop in parameters)
            if (parameters.hasOwnProperty(prop)) 
                delete parameters[prop];
                
            if (apply_inherited && this.parent) {
                // get inheritable parameters from this object for transfer to the created object

                var parent_parameters = parent.parameters;
                for(var prop in parent_parameters)
                if (parameters.hasOwnProperty(prop) && prop[0] === '/')
                    parameters[prop] = parent_parameters[prop];
            }
            
            this.__type = parse_type(type, parameters, this.attributes) || this.__type;

            this.raise('type');
            
            // no automatic refresh() calls
            
            // << set type and parameters
        };
        
        this._type = function(type, apply_inherited) {
            this.type(type, apply_inherited);
            return this;
        };
        
        // Get html code of the selected attributes
        // 
        // attributes (optional, string) - attributes, comma separated list
        // exclude (optional, bool) - use first argument as filter (false) or exclude list (true)
        // example: it.printAttributes("style") - result only one style attribute 'style="..."'
        // example: it.printAttributes("-id") - result attributes all exclude id
        //
        this.printAttributes = function(filter) {
            var result = '', attributes = this.attributes;
            
            if (filter) {
                // TODO: temporary inserted this checking:
                if (filter.indexOf(',') >= 0)
                    console.log('printAttributes() Use a space to separate of identifiers');
                
                if (filter[0] === '-') {
                    // exclusion defined
                    var exclude = filter.substr(1).split(' ');
                    for(var prop in attributes)
                    if (attributes.hasOwnProperty(prop) && prop[0] !== '$' && exclude.indexOf(prop) < 0) {
                        var value = attributes[prop];
                        if (value)
                            result += ' ' + prop + '="' + value + '"';
                    }
                }
                else {
                    // list of attributes
                    
                    var attrs = filter.split(' ');
                    for(var i = 0, c = attrs.length; i < c; i++) {
                        var key = attrs[i],
                            value = attributes[key];
                        if (value)
                            result += ' ' + key + '="' + value + '"';
                    }
                }
            }
            else {
                // unconditional out all attributes
                for(var prop in attributes)
                if (attributes.hasOwnProperty(prop) && prop[0] !== '$') {
                    var value = attributes[prop];
                    if (value)
                        result += ' ' + prop + '="' + value + '"';
                }
            }
            
            return result;
        };
        
        this.printControls = function() {
            var result = '', ctrls = this.controls;
            for(var i = 0, c = ctrls.length; i < c; i++)
                result += ctrls[i].wrappedHTML();
            return result;
        };
        
        // Set .$text attribute on this object and refresh DOM element.outerHTML
        this.text = function(text) {
            var attributes = this.attributes;
            if (arguments.length) {
                if (text !== attributes.$text) {
                    attributes.$text = text;
                    this.refresh();
                }
            }
            return attributes.$text;
        };
        
        this._text = function(text) {
            this.text(text);
            return this;
        };
        
        this.style = function(style) {
            var attributes = this.attributes;
            
            if (arguments.length) {
                if (style !== attributes.style) {
                    attributes.style = style;
                    
                    var element = this._element;
                    if (element)
                        element.style = style;
                    
                    this.raise('attributes', 'style', style);
                };
                return style;
            }
            
            return attributes.style;
        };
        
        this._style = function(style) {
            this.style(style);
            return this;
        };
        
        this.class = function(set, remove) {
            var attributes = this.attributes;
            
            if (set || remove) {
                var _class = attributes.class;
                var classes = (_class) ? _class.split(' ') : [];
                
                if (remove) {
                    remove = remove.split(' ');
                    for(var i = 0, c = remove.length; i < c; i++) {
                        var remove_class = remove[i];
                        var index = classes.indexOf(remove_class);
                        if (index >= 0)
                            classes.splice(index, 1);
                    }
                }
                
                if (set) {
                    set = set.split(' ');
                    for(var i = 0, c = set.length; i < c; i++) {
                        var set_class = set[i];
                        if (classes.indexOf(set_class) < 0)
                            classes.push(set_class);
                    }
                }
                
                _class = classes.join(' ');
                if (_class !== attributes.class) {
                    attributes.class = _class;
                    
                    var element = this._element;
                    if (element)
                        element.className = _class;
                    
                    this.raise('attributes', 'class', _class);
                }
            }
            
            return attributes.class;
        };
        
        this._class = function(set, remove) {
            this.class(set, remove);
            return this;
        };
        
        /**
         * Create a new component and insert to the component.controls collection at the specified index.
         * 
         * @param {number} index Index in component.controls collection.
         * @param {string} type Type containing the parameters attributes and styles.
         * @param $prime [prime] Prime value is a responsibility of the component. This parameter value can be of simple type or be derived from DataObject DataArray.
         * @param {object} [attributes] Attributes hash object to be passed to the component.
         * @param {function} [callback] The callback will be called each time after the creation of a new component.
         * @param {object} [this_arg] The value to be passed as the this parameter to the target function when the callback function is called. 
         * @returns {object} Returns newly created component object.
         */
        this.insert = function(index, type, /*optional*/ $prime, /*optional*/ attributes, /*optional*/ callback, /*optional*/ this_arg) {
            
            if (!type)
                return;
            
            // normalize arguments
            if (typeof $prime === 'function') {
                this_arg = attributes;
                callback = $prime;
                $prime = undefined;
                attributes = undefined;
            } else {
                if (typeof $prime === 'object' && !Array.isArray($prime)) {
                    this_arg = callback;
                    callback = attributes;
                    attributes = $prime;
                    $prime = undefined;
                }
                if (typeof attributes === 'function') {
                    this_arg = callback;
                    callback = attributes;
                    attributes = undefined;
                }
            }
            
            if (Array.isArray(type)) {
                // collection detected
                var result;
                for(var i = index, c = index + type.length; i < c; i++)
                    result = this.insert(i, type[i], $prime, attributes, callback, this_arg);
                return result;
            }
            
            if (typeof type === 'object') {
                // it is a control?
                var add_control = type;
                if (add_control.hasOwnProperty('__type'))
                    setParent.call(type, this, index);
                return add_control;
            }
            
            var attrs = {class:''}, parameters = {};
            
            for(var prop in attributes)
            if (attributes.hasOwnProperty(prop)) 
                attrs[prop] = attributes[prop];
                
            // transfer inheritable parameters to the created object
            var this_parameters = this.parameters;
            for(var prop in this_parameters)
            if (this_parameters.hasOwnProperty(prop) && prop[0] === '/')
                parameters[prop] = this_parameters[prop];
            
            // resolve constructor
            var __type, constructor;
            
            if (type[0] === '<') {
                // template
                __type = 'controls.custom';
                constructor = Custom;
                attrs.$template = controls.template(type);
                if (typeof $prime === 'string') {
                    attrs.$text = $prime;
                    $prime = undefined;
                }
            } else {
                __type = parse_type(type, parameters, attrs);
                constructor = resolve_ctr(__type, parameters);
            }

            if ($prime)
                attrs.$prime = $prime;
            
            // type error processing
            if (!constructor) {
                if (!type_error_mode)
                    throw new TypeError('Type ' + __type + ' not registered!');
                else {
                    // route to Stub
                    parameters['#{type}'] = type; // pass original type
                    parameters['#{__type}'] = __type;
                    parameters['#{callback}'] = callback;
                    parameters['#{this_arg}'] = this_arg;
                    constructor = resolve_ctr('controls.stub', parameters);
                }
            }
            
            // move $parameters to attributes (unsafe)
            for(var prop in parameters)
            if (parameters.hasOwnProperty(prop) && prop[0] === '$')
                attrs[prop.substr(1)] = parameters[prop];
            
            // create control

            var new_control = new constructor(parameters, attrs);

            // reflect after creation
            new_control.raise('type');

            // set parent property
            setParent.call(new_control, this, index);

            // callback
            if (callback)
                callback.call(this_arg || this, new_control);

            return new_control;
        };
        
        this.add = function(type, /*optional*/ $prime, /*optional*/ attributes, /*optional*/ callback, /*optional*/ this_arg) {
            return this.insert(this.controls.length, type, $prime, attributes, callback, this_arg);
        };
        
        this.addOrStub = function(type, /*optional*/ $prime, /*optional*/ attributes, /*optional*/ callback, /*optional*/ this_arg) {
            type_error_mode = 1;
            try {
                return this.add.apply(this, arguments);
            } catch (e) {}
            finally {
                type_error_mode = 0;
            }
        };
        
        this._add = function(type, /*optional*/ $prime, /*optional*/ attributes, /*optional*/ callback, /*optional*/ this_arg) {
            this.insert(this.controls.length, type, $prime, attributes, callback, this_arg);
            return this;
        };
        
        this.unshift = function(type, /*optional*/ $prime, /*optional*/ attributes, /*optional*/ callback, /*optional*/ this_arg) {
            return this.insert(0, type, $prime, attributes, callback, this_arg);
        };
        
        this._unshift = function(type, /*optional*/ $prime, /*optional*/ attributes, /*optional*/ callback, /*optional*/ this_arg) {
            this.insert(0, type, $prime, attributes, callback, this_arg);
            return this;
        };
        
        // Remove subcontrol from .controls collection
        //
        this.remove = function(control) {
            if (!arguments.length) {
                // .remove() without arguments removes this control from parent .controls collection
                this.parent = undefined;
                return;
            }
            
            if (control)
                control.parent = undefined;
            return this;
        };
        
        // Remove all subcontrols from .controls collection
        //
        this.removeAll = function() {
            for(var ctrls = this.controls, i = ctrls.length - 1; i >= 0; i--)
                this.remove(ctrls[i]);
            return this;
        };
        
        function route_data_event() {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('data');
            this.raise.apply(this, args);
        };
        
        this.bind = function(data_object, post_mode) {
            var this_data = this.data;
            if (data_object !== this_data) {
                this.data = data_object;

                if (this_data) {
                    this_data.removeListener(route_data_event);
                    this_data.unsubscribe(route_data_event);
                }

                if (data_object) {
                    if (post_mode)
                        data_object.subscribe(this, route_data_event);
                    else
                        data_object.listen_(this, route_data_event);
                }
                
                route_data_event.call(this);
            }
            return this;
        };
    
        this.every  = function(delegate, thisArg)   { return this.controls.every(delegate,   thisArg || this); };
        this.filter = function(delegate, thisArg)   { return this.controls.filter(delegate,  thisArg || this); };
        this.each   = this.forEach = function(delegate, thisArg)   { return this.controls.forEach(delegate, thisArg || this); };
        this.map    = function(delegate, thisArg)   { return this.controls.map(delegate,     thisArg || this); };
        this.some   = function(delegate, thisArg)   { return this.controls.some(delegate,    thisArg || this); };
    };
    
    function extract_func_code(func) {
        if (typeof func === 'function') {
            func = func.toString();
            var lbracket = func.indexOf('('),
                rbracket = func.indexOf(')');
            var first_par = func.indexOf('{'),
                last_par = func.lastIndexOf('}');
            // '@' - separator func argument names vs body
            return func.slice(lbracket + 1, rbracket) + '@' + func.substr(first_par + 1, last_par - first_par - 1);
        }
        return func;
    }
    
    /**
     * Parse type string, revision 2.0
     * 
     * @param {string} type Type with parameters, in format name:namespace.control`class1 classN#parameters/inheritable_parameters
     * @param {object} parameters Object acceptor parsed parameters
     * @param {object} attributes Object acceptor parsed attributes ($name, class)
     * @returns {String} Base type string
     */
    function parse_type(type, parameters, attributes) {
        
        var match = type.match(/\S+?(?=#|\/|`|\s|$|@)/);
        if (!match)
            return '';
        var match = match[0],
            __type, commapos = match.indexOf(':');
        if (commapos >= 0) {
            attributes.$name = match.substr(0, commapos);
            __type = match.substr(commapos + 1);
        } else
            __type = match;
        if (!__type)
            __type = 'controls.container';
        else if (__type.indexOf('.') < 0)
            __type = 'controls.' + __type;
        
        // parse parameters
        var params = type.slice(match.length),
            pos = 0, paramslen = params.length, inheritable = false, style = false;
        while(pos < paramslen && !style) {
            switch(params.charAt(pos)) {
                case ' ':case '\n':case '\t':  // parameters separator
                    pos++;
                    break;
                case '/': // next parameters is inheritable
                    inheritable = true; pos++;
                    break;
                case '`': // reminder of the line is style
                    style = true; pos++;
                    break;
                case '#': // assign identifier
                    var id_regex = /#.*?(?=#|`|\/|\s|$|@)/g;
                    id_regex.lastIndex = pos;
                    var match_id = id_regex.exec(params)[0];
                    attributes.id = match_id.slice(1);
                    pos += match_id.length;
                    break;
                default:
                    var par_name_regex = /\S+?(?=(=|#|`|\/|\s|$|@))/g;
                    par_name_regex.lastIndex = pos;
                    var par_name_match = par_name_regex.exec(params);
                    if (!par_name_match)
                        pos++;
                    else {
                        var parname = par_name_match[0],
                        par_name_after = par_name_match.index + parname.length;
                        if (par_name_match[1] === '=') {
                            if (params.charAt(par_name_after + 1) === '"') {
                                // param="value with spaces"
                                var quotepos = params.indexOf('"', par_name_after + 2);
                                while(quotepos >= 0 && quotepos < paramslen - 1 && ' \n\t#/`'.indexOf(params.charAt(quotepos + 1)) < 0)
                                    quotepos = params.indexOf('"', quotepos + 1);
                                if (quotepos < 0) {
                                    // param=" may be \" and no "
                                    if (inheritable) parname = '/' + parname;
                                    parameters[parname] = params.substr(par_name_after + 2);
                                    pos = paramslen;
                                } else {
                                    if (inheritable) parname = '/' + parname;
                                    parameters[parname] = params.slice(par_name_after + 2, quotepos);
                                    pos = quotepos + 1;
                                }
                            } else {
                                // param=value
                                var value_regex = /\S*?(?=(#|`|\/|\s|$|@))/g;
                                value_regex.lastIndex = par_name_after + 1;
                                var value = value_regex.exec(params)[0];
                                pos = par_name_after + 1 + value.length;
                                if (inheritable) parname = '/' + parname;
                                parameters[parname] = value;
                            }
                        } else {
                            // param
                            if (inheritable) parname = '/' + parname;
                            parameters[parname] = true;
                            pos = par_name_after;
                        }
                    }
            }
        }
        
        if (style) {
            var classes = params.length,
                colonpos = params.indexOf(':', pos);
            if (colonpos >= 0) {
                while(' \n\t`'.indexOf(params.charAt(colonpos)) < 0 && colonpos > pos)
                    colonpos--;
                classes = colonpos;
            }
            attributes.class = params.slice(pos, classes);
            attributes.style = params.slice(classes).trim();
        }
    
        // TODO {href} syntax

        return __type;
    }
    
    /**
     *  Resolve __type and parameters to control constructor
     *  
     * @param {string} __type Base type, example "controls.custom"
     * @param {object} parameters Parameters parsed from original type
     * @returns {object} Control constructor
     */
    function resolve_ctr(__type, parameters) {
        // after parse and before ctr resolve apply alias
        
        var constructor;
        __type = __type.toLowerCase();
        
        // map __type -> subtypes array
        if (Object.keys(parameters).length) {
            var subtypes_array = controls.subtypes[__type]; 
            if (subtypes_array)
            for(var i = 0, c = subtypes_array.length; i < c; i++) { // iterate subtypes array
                // each subtypes array item is key parameters object and contains the constructor reference
                var key_parameters = subtypes_array[i];

                // check for matching all key params values
                var hit = true;
                
                for(var prop in parameters)
                if (parameters.hasOwnProperty(prop)) {
                    var par_value = parameters[prop];
                    if (prop[0] === '/')
                        prop = prop.slice(1);
                    if ('__ctr,??'.indexOf(prop) < 0
                    && key_parameters[prop] !== par_value) {
                        hit = false;
                        break;
                    }
                }
            
                if (hit) {
                    constructor = key_parameters.__ctr;
                    break;
                }
            }
        }
        
        if (!constructor) {
            constructor = controls[__type];
            
            // apply if alias
            if (constructor && constructor.isAlias && constructor.__type !== __type) {
                // apply alias parameters
                var alias_parameters = constructor.parameters;
                for(var prop in alias_parameters)
                if (alias_parameters.hasOwnProperty(prop)) 
                    parameters[prop] = alias_parameters[prop];
                
                constructor = resolve_ctr(constructor.__type, parameters);
            }
        }
        
        return constructor;
    }
    controls.resolveType = resolve_ctr;
    
    // Unresolved type error processing mode
    // 0 - throw TypeError, 1 - create Stub
    //
    var type_error_mode = 0;
    controls.createOrStub = function(type, /*optional*/ parameters, /*optional*/ attributes, /*optional*/ callback, /*optional*/ this_arg) {
        type_error_mode = 1;
        try {
            return controls.create.apply(this, arguments);
        } catch (e) {}
        finally {
            type_error_mode = 0;
        }
    };
    
    /**
     * Create control from parsed type, parameters and attributes
     * 
     * @param {string} type Base type [and parameters].
     * @param {object} parameters Parsed parameters.
     * @param {object} attributes Parsed attributes.
     * @returns {object} Returns newly created component object.
     */
    controls.createBase = function(type, parameters, attributes) {
        parameters = parameters || {};
        attributes = attributes || {};
        
        var __type = parse_type(type, parameters, attributes),
            constructor = resolve_ctr(__type, parameters);
            
        if (!constructor)
            throw new TypeError('Type ' + __type + ' not registered!');

        for(var prop in parameters)
        if (parameters.hasOwnProperty(prop) && prop[0] === '$')
            attributes[prop.substr(1)] = parameters[prop];
                
        // create object
        
        var new_control = (constructor.is_constructor) // constructor or factory method ?
            ? new constructor(parameters, attributes)
            : constructor(parameters, attributes);
        
        // reflect after creation if control only
        if (typeof new_control === 'object' && '__type' in new_control)
            new_control.raise('type');
        
        return new_control;
    };
    
    /**
     * Create control
     * 
     * @param {string} type Type containing the parameters attributes and styles.
     * @param $prime [prime] Prime value is a responsibility of the component. This parameter value can be of simple type or be derived from DataObject DataArray.
     * @param {object} [attributes] Attributes hash object to be passed to the component.
     * @param {function} [callback] The callback will be called each time after the creation of a new component.
     * @param {object} [this_arg] The value to be passed as the this parameter to the target function when the callback function is called. 
     * @returns {object} Returns newly created component object.
     */
    controls.create = function(type, /*optional*/ $prime, /*optional*/ attributes, /*optional*/ callback, /*optional*/ this_arg) {

        // normalize arguments
        if (typeof $prime === 'function') {
            this_arg = attributes;
            callback = $prime;
            $prime = undefined;
            attributes = undefined;
        } else {
            if (typeof $prime === 'object' && !Array.isArray($prime)) {
                this_arg = callback;
                callback = attributes;
                attributes = $prime;
                $prime = undefined;
            }
            if (typeof attributes === 'function') {
                this_arg = callback;
                callback = attributes;
                attributes = undefined;
            }
        }
            
        var parameters = {};
        attributes = attributes || {};
        
        var __type, constructor;
            
        if (type.charAt(0) === '<') {
            // template
            __type = 'controls.custom';
            constructor = Custom;
            attributes.$template = controls.template(type);
            if (typeof $prime === 'string') {
                attributes.$text = $prime;
                $prime = undefined;
            }
        } else {
            __type = parse_type(type, parameters, attributes);
            constructor = resolve_ctr(__type, parameters);
        }
        
        if ($prime !== undefined)
            attributes.$prime = $prime;
            
        if (!constructor) {
            if (!type_error_mode)
                throw new TypeError('Type ' + __type + ' not registered!');
            else {
                // route to Stub
                parameters['#{type}'] = type; // pass original type
                parameters['#{__type}'] = __type;
                parameters['#{callback}'] = callback;
                parameters['#{this_arg}'] = this_arg;
                constructor = resolve_ctr('controls.stub', parameters);
            }
        }    

        for(var prop in parameters)
        if (parameters.hasOwnProperty(prop) && prop[0] === '$')
            attributes[prop.substr(1)] = parameters[prop];
                
        // create object
        
        var new_control = (constructor.is_constructor) // constructor or factory method ?
            ? new constructor(parameters, attributes)
            : constructor(parameters, attributes);
        
        // reflect after creation if control only
        if (typeof new_control === 'object' && '__type' in new_control)
            new_control.raise('type');
        
        return new_control;
    };

    // controls.reviverJSON()
    // 
    // use with JSON.parse(json, controls.reviverJSON), this function restores controls
    //
    controls.reviverJSON = function reviverJSON(key, value) {
        if (typeof(value) === 'object' && value !== null && value.hasOwnProperty('__type')) {
            var parameters = {},
                __type = parse_type(value.__type, parameters),
                constructor = resolve_ctr(__type, parameters);
            
            if (!constructor) {
                //throw new TypeError('controls.reviverJSON(): ' + __type + ' constructor not registered!');
                console.log('controls.reviverJSON(): ' + __type + ' constructor not registered!');
                // route to Stub
                parameters['#{type}'] = value.__type; // pass original type
                parameters['#{__type}'] = __type;
//                parameters['#{callback}'] = callback;
//                parameters['#{this_arg}'] = this_arg;
                constructor = resolve_ctr('controls.stub', parameters);
            }
            
            var new_control;
            
            var revive_func = constructor.revive;
            if (revive_func)
                new_control = revive_func(constructor, parameters, value);
            else
                new_control = controls.reviveControl(constructor, parameters, value);
            
            // reflect after creation
            new_control.raise('type');

            return new_control;
        }
        return value;
    };
    
    // revive json object recursively
    controls.revive = function revive(json_object) {
        if (json_object) {
            for (var prop in json_object)
            if (json_object.hasOwnProperty(prop))
            { 
                var item = json_object[prop];
                if (Array.isArray(item) || (typeof(item) === 'object' && item.hasOwnProperty('__type')))
                    json_object[prop] = revive(item);
            }
            
            if (typeof(json_object) === 'object' && json_object.hasOwnProperty('__type'))
                json_object = reviverJSON(null, json_object);
        }
        return json_object;
    };
    
    // Default control revive function
    controls.reviveControl = function(constructor, parameters, data) {
        if (data) {
            var control = constructor.is_constructor ? new constructor(parameters, data.attributes) : constructor(parameters, data.attributes);
            if (data.controls)
                control.controls = data.controls;
            
            var outer_template = data.outer_template;
            if (outer_template) {
                // '@' - separator func argument names vs body
                var atpos = outer_template.indexOf('@');
                control.template(new Function(outer_template.substr(0, atpos), outer_template.substr(atpos + 1)));
            }
            
            var inner_template = data.inner_template;
            if (inner_template) {
                var atpos = inner_template.indexOf('@');
                control.template(null, new Function(inner_template.substr(0, atpos), inner_template.substr(atpos + 1)));
            }
            
            // Deserialize events
            var data_events = data.events; // json object collection of serialized controls.Event
            if (data_events) {
                var events = control.events = {};
                for(var i = 0, c = data_events.length; i < c; i++) {
                    var item = data_events[i],
                        listeners = item.listeners;
                    for(var i = 0, c = listeners.length; i < c; i+=2) {
                        var listener = listeners[i];
                        if (typeof listener === 'string') {
                            var atpos = listener.indexOf('@');
                            listeners[i] = new Function(listener.substr(0, atpos), listener.substr(atpos + 1));
                        }
                    }
                    events[item.capture ? ('#' + item.type) : item.type] = new controls.Event(control, item.type, item.capture, listeners);
                }
            }
            return control;
        }
    };
    
    controls.decodeHTML = function(text) {
        return text ? text.replace(DECODE_HTML_MATCH, function(match) { return String.fromCharCode(parseInt(match.slice(2))); }) : text;
    };
    
    controls.encodeHTML = function(text) {
        return text ? text.replace(ENCODE_HTML_MATCH, function(match) { return ENCODE_HTML_PAIRS[match] || match; }) : text;
    };
    
    controls.extend = function(object, source) {
        for(var prop in source)
        if (source.hasOwnProperty(prop)) 
            object[prop] = source[prop];
        return object;
    };
    
    controls.delay = function(func, delay) {
        return setTimeout(function() { return func.apply(null, Array.prototype.slice.call(arguments, 2)); }, delay);
    };
    
    
    // Elementals //////////////////////////////////////////////////////////////
    
    
    (function(){
        function gencode(tagname, closetag) {
            return '\nfunction c' + tagname + '(p, a) { controls.controlInitialize(this, \'controls.' + tagname + '\', p, a, c' + tagname + '.outer_template); }\n\
c' + tagname + '.prototype = controls.control_prototype;\n'
+ (closetag
    ? 'c' + tagname + '.outer_template = function(it) { return \'<' + tagname + '\' + it.printAttributes() + \'>\' + (it.attributes.$text || \'\') + it.printControls() + \'</' + tagname + '>\'; };\n'
    : 'c' + tagname + '.outer_template = function(it) { return \'<' + tagname + '\' + it.printAttributes() + \'>\'; };\n')
+ 'controls.typeRegister(\'' + tagname + '\', c' + tagname + ');\n';
        }
        
        Function('controls', 'a,abbr,address,article,aside,b,base,bdi,bdo,blockquote,button,canvas,cite,code,col,colgroup,command,datalist,dd,del,details,\
dfn,div,dl,dt,em,embed,fieldset,figcaption,figure,footer,form,g,gnome,h1,h2,h3,h4,h5,h6,header,i,iframe,img,ins,kbd,keygen,label,legend,li,link,map,mark,menu,meter,nav,\
noscript,object,ol,optgroup,option,output,p,pre,progress,ruby,rt,rp,s,samp,script,section,small,span,strong,style,sub,summary,sup,svg,\
table,tbody,td,textarea,tfoot,th,thead,time,title,tr,u,ul,var,video,wbr'
            .split(',').map(function(tagname) { return gencode(tagname.toLowerCase(), true); }).join(''))(controls);
    
        Function('controls', 'area,br,hr,meta,param,source,track'
            .split(',').map(function(tagname) { return gencode(tagname.toLowerCase(), false); }).join(''))(controls);
    })();
    
    
    // Special /////////////////////////////////////////////////////////////////

            
    // Container
    // 
    // without own html
    // 
    function Container(parameters, attributes) {
        controls.controlInitialize(this, 'controls.container', parameters, attributes, controls.default_inner_template);
    };
    Container.prototype = controls.control_prototype;
    controls.typeRegister('container', Container);
    
    // Custom
    // 
    // set template after creating the control
    // 
    function Custom(parameters, attributes) {
        if (attributes.$prime) {
            attributes.$template = attributes.$prime;
            delete attributes.$prime;
        }
        controls.controlInitialize(this, 'controls.custom', parameters, attributes,
            attributes.$template || attributes.$outer_template,
            attributes.$inner_template);
    };
    Custom.prototype = controls.control_prototype;
    controls.typeRegister('custom', Custom);

    // Stub
    // 
    // Stub control created on type error if type_error_mode
    // 
    function Stub(parameters, attributes) {
        this.isStub = true;
        
//        var original_type = parameters['#{type}'];
//        var original__type = parameters['#{__type}'];
//        var callback = parameters['#{callback}'];
//        var this_arg = parameters['#{this_arg}'];
//        var hrefs = parameters['#{href}'];
//        if (hrefs)
//            hrefs = hrefs.split(/,| |;/g);
        
//        var save_attributes = {};
//        for(var prop in attributes)
//        if (attributes.hasOwnProperty(prop))
//            save_attributes[prop] = attributes[prop];
        
        controls.controlInitialize(this, 'controls.stub', parameters, attributes, function(it) { return '<div' + it.printAttributes() + '>' + it.printControls() + '</div>'; } );
        this.class('stub');
        
        var state = 0; // 0 - stub, > 0 - resources loaded, < 0 - load error
        Object.defineProperty(this, "state", {
            enumerable: true, 
            get: function() { return state; },
            set: function(value) {
                if (value !== state) {
                    state = value;
                    if (value === 0)    this.class(null, 'stub-loading stub-error');
                    else if (value < 0) this.class('stub-error', 'stub-loading');
                    else                this.class('stub-loading', 'stub-error');
                    
                    this.raise('state');
                    
                    if (this.state > 0)
                        this.tryReplace();
                }
            }
        });
        
        // try create control and replace stub on success
        this.tryReplace = function() {
            var parameters = this.parameters,
                params = {},
                attrs = {},
                attributes = this.attributes;
        
            for(var prop in parameters)
            if (parameters.hasOwnProperty(prop) && prop[0] !== '#' && prop[1] !== '{')
                params[prop] = parameters[prop];
            
            for(var prop in attributes)
            if (attributes.hasOwnProperty(prop))
                attrs[prop] = attributes[prop];
        
            var control = controls.createBase(parameters['#{type}'], params, attrs);
            if (control) {
                control.class(null, 'stub stub-loading stub-error');
                this.replaceItself(control);
                // raise event
                this.raise('control', control);
            }
        };
    };
    Stub.prototype = controls.control_prototype;
    controls.typeRegister('stub', Stub);
    
    // Head
    function Head(parameters, attributes) {
        controls.controlInitialize(this, 'controls.head', parameters, attributes, Head.outer_template);
        this.attach    = function() { this.element = document.head; return this; };
        this.attachAll = function() { this.element = document.head; return Head.prototype.attachAll.call(this); return this; };
    };
    Head.prototype = controls.control_prototype;
    Head.outer_template = function(it) { return '<head>' + (it.attributes.$text || '') + it.printControls() + '</head>'; };
    controls.typeRegister('head', Head);
    
    // Body
    function Body(parameters, attributes) {
        controls.controlInitialize(this, 'controls.body', parameters, attributes, Body.outer_template);
        this.attach    = function() { this.element = document.body; return this; };
        this.attachAll = function() { this.element = document.body; return Body.prototype.attachAll.call(this); return this; };
    };
    Body.prototype = controls.control_prototype;
    Body.outer_template = function(it) { return '<body' + it.printAttributes('-id') + '>' + (it.attributes.$text || '') + it.printControls() + '</body>'; };
    controls.typeRegister('body', Body);
    

    // Layouts /////////////////////////////////////////////////////////////////


    // Layout
    // Parameters:
    // float=left, float=right
    // 
    // var layout = controls.create('controls.Layout#float=left');
    // layout.cellSet.class(...);
    // 
    function Layout(parameters, attributes) {
        this.initialize('controls.layout', parameters, attributes, Layout.outer_template);
        var clearfix = false; // use clearfix if float
        
        this.cellSet = new Container();
        this.cellSet.listen_('attributes', this, function(event) {
            var attr_name = event.name,
                attr_value = event.value,
                remove = (attr_value === undefined || attr_value === null);
            
            var element = this._element;
            if (element) {
                var nodes = element.childNodes; // element.querySelectorAll('[data-type=layout-item]');
                for(var i = nodes.length - 1; i>=0; i--) {
                    var node = nodes[i];
                    if (remove)
                        node.removeAttribute(attr_name);
                    else
                        node.setAttribute(attr_name, attr_value);
                }
            }
        });
        
        this.listen_('type', function() {
            var parameters = this.parameters,
                floatvalue;
            
            for(var prop in parameters)
            if (parameters.hasOwnProperty(prop) && prop === 'float' || prop === '/float')
                floatvalue = parameters[prop];
            
            if (floatvalue)
                this.cellSet.style('float:' + floatvalue);
            
            clearfix = floatvalue;
        });
    };
    Layout.prototype = controls.control_prototype;
    Layout.outer_template = function(it) {
        var out = '<div' + it.printAttributes() + '>',
            ctrls = it.controls, cell = '<div data-type="layout-item"' + it.cellSet.printAttributes("-id") + '>';
        for(var i = 0, c = ctrls.length; i < c; i++)
            out += cell + ctrls[i].wrappedHTML() + '</div>';
        return out + (it.clearfix) ? '<div style="clear:both;"></div></div>' : '</div>';
    };
    controls.typeRegister('layout', Layout);

    
    function List(parameters, attributes) {
        this.initialize('controls.list', parameters, attributes, List.outer_template);
        
        this.itemSet = new Container();
        this.itemSet.listen_('attributes', this, function(event) {
            var attr_name = event.name;
            var attr_value = event.value;
            var remove = (attr_value === undefined || attr_value === null);
            
            var element = this._element;
            if (element) {
                var nodes = element.childNodes; // element.querySelectorAll('[data-type=layout-item]');
                for(var i = nodes.length - 1; i>=0; i--) {
                    var node = nodes[i];
                    if (remove)
                        node.removeAttribute(attr_name);
                    else
                        node.setAttribute(attr_name, attr_value);
                }
            }
        });
    };
    List.prototype = controls.control_prototype;
    List.outer_template = function(it) {
        var out ='<ul' + it.printAttributes() + '>',
            ctrls = it.controls, item = '<li' + it.itemSet.printAttributes("-id") + '>';
        for(var i = 0, c = ctrls.length; i < c; i++)
            out += item + ctrls[i].wrappedHTML() + '</li>';
        return out + '</ul>';
    };
    controls.typeRegister('list', List);
    
    
    // Input
    // 
    function Input(parameters, attributes) {
        this.initialize('controls.input', parameters, attributes, Input.outer_template)
        .listen_('change', function() {
            this.attributes.value = this.element.value;
        }, true)
        .listen_('element', function(element) {
            if (element)
                element.value = this.attributes.value || '';
        });
        Object.defineProperty(this, 'value', {
            get: function() { return this.attributes.value; },
            set: function(value) {
                var element = this._element;
                this.attributes.value = value;
                if (element)
                    element.value = value;
            }
        });
    };
    Input.prototype = controls.control_prototype;
    Input.outer_template = function(it) { return '<input' + it.printAttributes() + '>' + (it.attributes.$text || '') + '</input>'; };
    controls.typeRegister('input', Input);
    
    
    // Select
    // 
    // Attributes:
    //  $data {DataArray}
    //
    function Select(parameters, attributes) {
        this.initialize('controls.select', parameters, attributes, Select.outer_template, Select.inner_template)
        .bind(attributes.hasOwnProperty('$data')
            ? controls.create('DataArray', {$data: attributes.$data})
            : controls.create('DataArray'))
        .listen_('data', this.refreshInner) // event routed from data object
        .listen_('change', function() {
            this.attributes.value = this.element.value;
        }, true)
        .listen_('element', function(element) {
            if (element)
                element.value = this.attributes.value;
        });
        
        Object.defineProperty(this, 'value', {
            get: function() { return this.attributes.value; },
            set: function(value) {
                var element = this._element;
                this.attributes.value = value;
                if (element)
                    element.value = value;
            }
        });
    };
    Select.prototype = controls.control_prototype;
    Select.outer_template = function(it) { return '<select' + it.printAttributes() + '>' + (it.attributes.$text || '') + it.data.map(function(item){ return '<option value=' + item + '>' + item + '</option>'; }).join('') + '</select>'; };
    Select.inner_template = function(it) { return (it.attributes.$text || '') + it.data.map(function(item){ return '<option value=' + item + '>' + item + '</option>'; }).join(''); };
    controls.typeRegister('select', Select);
    
    // exports
    if (typeof module !== 'undefined' && module.exports) module.exports = controls;
    if (typeof define === 'function' && define.amd) define(controls);
    if (typeof window !== 'undefined' && (!window.controls || window.controls.VERSION < controls.VERSION))
        window.controls = controls;
})();
