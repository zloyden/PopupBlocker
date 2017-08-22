import { ApplyHandler, makeObjectProxy, wrapMethod } from '../proxy';
import { verifyEvent, retrieveEvent, verifyCurrentEvent } from '../events/verify';
import examineTarget from '../events/examine-target';
import { _dispatchEvent } from './dispatchEvent/orig';
import { timeline, position } from '../timeline/index';
import { TLEventType, TimelineEvent } from '../timeline/event';
import createUrl from '../url';
import * as log from '../log';
import bridge from '../bridge';

const openVerifiedWindow:ApplyHandler = function(_open, _this, _arguments, context) {
    let url = _arguments[0];
    log.call('Called window.open with url ' + url);
    // Checks if an url is in a whitelist
    const destDomain = createUrl(url).hostname;
    if (bridge.whitelistedDestinations.indexOf(destDomain) !== -1) {
        log.print(`The domain ${destDomain} is in whitelist.`);
        console.log(destDomain);
        console.log(bridge.whitelistedDestinations);
        return _open.apply(_this, _arguments);
    }
    let currentEvent = retrieveEvent();
    let passed = verifyEvent(currentEvent);
    let win;
    if (passed) {
        log.print('event verified, inquiring event timeline..');
        if (timeline.canOpenPopup(position)) {
            log.print('calling original window.open...');
            win = _open.apply(_this, _arguments);
            win = makeObjectProxy(win);
            log.callEnd();
            return win;
        }
        log.print('canOpenPopup returned false');
        log.callEnd();
    }
    bridge.showAlert(bridge.domain, url , false);
    if (currentEvent) { examineTarget(currentEvent, _arguments[0]); }
    log.print('mock a window object');
    // Return a mock window object, in order to ensure that the page's own script does not accidentally throw TypeErrors.
    win = mockWindow(_arguments[0], _arguments[1]);
    win = makeObjectProxy(win);
    context['mocked'] = true;
    log.callEnd();
    return win;
};

const mockWindow = (href, name) => {
    let loc = document.createElement('a');
    loc.href = href;
    let doc = Object.create(HTMLDocument.prototype);
    let win = <any>{};
    Object.getOwnPropertyNames(window).forEach(function(prop) {
        switch(typeof window[prop]) {
            case 'object': win[prop] = {}; break;
            case 'function': win[prop] = function() {return true;}; break;
            case 'string':  win[prop] = ''; break;
            case 'number': win[prop] = NaN; break;
            case 'boolean': win[prop] = false; break;
            case 'undefined': win[prop] = undefined; break;
        }
    });
    doc.location = loc;
    // doc.open = function(){return this;}
    // doc.write = function(){};
    // doc.close = function(){};
    win.opener = window;
    win.closed = false;
    win.name = name;

    Object.defineProperty(win, 'location', {
        get: function() {
            timeline.registerEvent(new TimelineEvent(TLEventType.GET, 'location', {
                this: this
            }), position);
            return loc;
        },
        set: function(incoming) {
            timeline.registerEvent(new TimelineEvent(TLEventType.SET, 'location', {
                this: this,
                arguments: [incoming]
            }), position);
        }
    });

    win.document = doc;
    return win;
};

wrapMethod(window, 'open', openVerifiedWindow);
wrapMethod(Window.prototype, 'open', openVerifiedWindow); // for IE
