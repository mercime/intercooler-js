////////////////////////////////////

/**
 * Intercooler.js - there is no need to be upset.
 */
var Intercooler = Intercooler || (function () {
  'use strict'; // inside function for better merging

  //--------------------------------------------------
  // Vars
  //--------------------------------------------------
  var _MACROS = ['ic-get-from', 'ic-post-to', 'ic-put-to', 'ic-delete-from',
                 'ic-style-src', 'ic-attr-src', 'ic-prepend-from', 'ic-append-from'];
  var _scrollHandler = null;
  var _UUID = 1;

  //============================================================
  // Base Swap Definitions
  //============================================================
  function remove(elt) {
    elt.remove();
  }

  function show(elt) {
    elt.show();
  }

  function hide(elt) {
    elt.hide();
  }

  function prepend(parent, responseContent){
    parent.prepend(responseContent);
    if (parent.attr('ic-limit-children')) {
      var limit = parseInt(parent.attr('ic-limit-children'));
      if (parent.children().length > limit) {
        parent.children().slice(limit, parent.children().length).remove();
      }
    }
  }

  function append(parent, responseContent){
    parent.append(responseContent);
    if (parent.attr('ic-limit-children')) {
      var limit = parseInt(parent.attr('ic-limit-children'));
      if (parent.children().length > limit) {
        parent.children().slice(0, parent.children().length - limit).remove();
      }
    }
  }

  //============================================================
  // Utility Methods
  //============================================================
  function log(elt, msg, level) {
    if(elt == null) {
      elt = $('body');
    }
    elt.trigger("log.ic", [msg, level, elt]);
    if(level == "ERROR") {
      if(window.console) {
        window.console.log("Intercooler Error : " + msg);
      }
      var errorUrl = closestAttrValue($('body'), 'ic-post-errors-to');
      if(errorUrl){
        $.post(errorUrl, {'error': msg})
      }
    }
  }

  function uuid() {
    return _UUID++;
  }

  function icSelectorFor(elt) {
    return "[ic-id='" + getIntercoolerId(elt) + "']";
  }

  function findById(x) {
    return $("#" + x);
  }

  function parseInterval(str) {
    log(null, "POLL: Parsing interval string " + str, 'DEBUG');
    if (str == "null" || str == "false" || str == "") {
      return null;
    } else if (str.lastIndexOf("ms") == str.length - 2) {
      return parseFloat(str.substr(0, str.length - 2));
    } else if (str.lastIndexOf("s") == str.length - 1) {
      return parseFloat(str.substr(0, str.length - 1)) * 1000;
    } else {
      return 1000;
    }
  }

  function initScrollHandler() {
    if (_scrollHandler == null) {
      _scrollHandler = function () {
        $("[ic-trigger-on='scrolled-into-view']").each(function () {
          if (isScrolledIntoView($(this)) && $(this).data('ic-scrolled-into-view-loaded') != true) {
            $(this).data('ic-scrolled-into-view-loaded', true);
            fireICRequest($(this));
          }
        })
      };
      $(window).scroll(_scrollHandler);
    }
  }

  function currentUrl() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  //============================================================
  // Request/Parameter/Include Processing
  //============================================================
  function getTarget(elt) {
    var closest = $(elt).closest('[ic-target]');
    var targetValue = closest.attr('ic-target');
    if(targetValue == 'this') {
      return closest;
    } else if(targetValue && targetValue.indexOf('this.') != 0) {
      if(targetValue.indexOf('closest ') == 0) {
        return elt.closest(targetValue.substr(8));
      } else {
        return $(targetValue);
      }
    } else {
      return elt;
    }
  }

  function getTargetForHistory(elt) {
    var targetValue = closestAttrValue(elt, 'ic-history-target');
    if(targetValue) {
      return $(targetValue);
    } else {
      return getTarget(elt);
    }
  }

  function handleHistory(elt, target, xhr, originalHtml) {
    if (xhr.getResponseHeader("X-IC-PushURL")) {
      log(elt, "X-IC-PushURL: pushing " + xhr.getResponseHeader("X-IC-PushURL"), "DEBUG");
      _historySupport.pushUrl(xhr.getResponseHeader("X-IC-PushURL"), elt, originalHtml);
    } else {
      if(closestAttrValue(elt, 'ic-push-url') == "true") {
        _historySupport.pushUrl(elt.attr('ic-src'), elt, target, originalHtml);
      }
    }
  }

  function processHeaders(elt, xhr) {

    elt.trigger("beforeHeaders.ic", [elt, xhr]);
    log(elt, "response headers: " + xhr.getAllResponseHeaders(), "DEBUG");
    var target = null;
    if (xhr.getResponseHeader("X-IC-Refresh")) {
      var pathsToRefresh = xhr.getResponseHeader("X-IC-Refresh").split(",");
      log(elt, "X-IC-Refresh: refreshing " + pathsToRefresh, "DEBUG");
      $.each(pathsToRefresh, function (i, str) {
        refreshDependencies(str.replace(/ /g, ""), elt);
      });
    }
    if (xhr.getResponseHeader("X-IC-Script")) {
      log(elt, "X-IC-Script: evaling " + xhr.getResponseHeader("X-IC-Script"), "DEBUG");
      eval(xhr.getResponseHeader("X-IC-Script"));
    }
    if (xhr.getResponseHeader("X-IC-Redirect")) {
      log(elt, "X-IC-Redirect: redirecting to " + xhr.getResponseHeader("X-IC-Redirect"), "DEBUG");
      window.location = xhr.getResponseHeader("X-IC-Redirect");
    }
    if (xhr.getResponseHeader("X-IC-CancelPolling") == "true") {
      cancelPolling(elt);
    }
    if (xhr.getResponseHeader("X-IC-Open")) {
      log(elt, "X-IC-Open: opening " + xhr.getResponseHeader("X-IC-Open"), "DEBUG");
      window.open(xhr.getResponseHeader("X-IC-Open"));
    }
    if(xhr.getResponseHeader("X-IC-Trigger")) {
      log(elt, "X-IC-Trigger: found trigger " + xhr.getResponseHeader("X-IC-Trigger"), "DEBUG");
      target = getTarget(elt);
      var triggerArgs = [];
      if(xhr.getResponseHeader("X-IC-Trigger-Data")){
        triggerArgs = $.parseJSON(xhr.getResponseHeader("X-IC-Trigger-Data"))
      }
      target.trigger(xhr.getResponseHeader("X-IC-Trigger"), triggerArgs);
    }
    if (xhr.getResponseHeader("X-IC-Remove")) {
      if (elt) {
        target = getTarget(elt);
        log(elt, "X-IC-REMOVE header found.", "DEBUG");
        remove(target);
      }
    }

    elt.trigger("afterHeaders.ic", [elt, xhr]);

    return true;
  }


  function beforeRequest(elt) {
    elt.addClass('disabled');
    elt.data('ic-request-in-flight', true);
  }

  function requestCleanup(indicator, elt) {
    if (indicator.length > 0) {
      hide(indicator);
    }
    elt.removeClass('disabled');
    elt.data('ic-request-in-flight', false);
    if(elt.data('ic-next-request')) {
      elt.data('ic-next-request')();
      elt.data('ic-next-request', null);
    }
  }

  function replaceOrAddMethod(data, actualMethod) {
    var regex = /(&|^)_method=[^&]*/;
    var content = "&_method=" + actualMethod;
    if(regex.test(data)) {
      return data.replace(regex, content)
    } else {
      return data + "&" + content;
    }
  }

  function globalEval(script) {
    return window[ "eval" ].call(window, script);
  }

  function closestAttrValue(elt, attr) {
    var closestElt = $(elt).closest('[' + attr + ']');
    if(closestElt) {
      return closestElt.attr(attr);
    } else {
      return null;
    }
  }

  function formatError(e) {
    var msg = e.toString() + "\n";
    try {
      msg += e.stack;
    } catch(e) {
      // ignore
    }
    return msg;
  }

  function handleRemoteRequest(elt, type, url, data, success) {

    beforeRequest(elt);

    data = replaceOrAddMethod(data, type);

    // Spinner support
    var indicator = findIndicator(elt);
    if(indicator.length > 0) {
      show(indicator);
    }

    var requestId = uuid();
    var requestStart = new Date();

    $.ajax({
      type: type,
      url: url,
      data: data,
      dataType: 'text',
      headers: {
        "Accept": "text/html-partial, */*; q=0.9",
        "X-IC-Request": true,
        "X-HTTP-Method-Override": type
      },
      beforeSend : function(xhr, settings){
        elt.trigger("beforeSend.ic", [elt, data, settings, xhr, requestId]);
        log(elt, "before AJAX request " + requestId + ": " + type + " to " + url, "DEBUG");
        var onBeforeSend = closestAttrValue(elt, 'ic-on-beforeSend');
        if(onBeforeSend) {
          globalEval('(function (data, settings, xhr) {' + onBeforeSend + '})')(data, settings, xhr);
        }
      },
      success: function (data, textStatus, xhr) {
        elt.trigger("success.ic", [elt, data, textStatus, xhr, requestId]);
        log(elt, "AJAX request " + requestId + " was successful.", "DEBUG");
        var onSuccess = closestAttrValue(elt, 'ic-on-success');
        if(onSuccess) {
          if(globalEval('(function (data, textStatus, xhr) {' + onSuccess + '})')(data, textStatus, xhr) == false) {
            return;
          }
        }

        var target = getTarget(elt);
        var beforeHeaders = new Date();
        try {
          if (processHeaders(elt, xhr)) {
            log(elt, "Processed headers for request " + requestId + " in " + (new Date() - beforeHeaders) + "ms", "DEBUG");
            var beforeSuccess = new Date();

            var targetForHistory = null;
            var originalHtml = null;
            if (xhr.getResponseHeader("X-IC-PushURL") || closestAttrValue(elt, 'ic-push-url') == "true") {
              elt.trigger("beforeHistorySnapshot.ic", [elt, target]);
              requestCleanup(indicator, elt); // clean up before snapshotting HTML
              targetForHistory = getTargetForHistory(elt);
              originalHtml = targetForHistory.html()
            }
            success(data, textStatus, elt, xhr);
            handleHistory(elt, targetForHistory, xhr, originalHtml);
            log(elt, "Process content for request " + requestId + " in " + (new Date() - beforeSuccess) + "ms", "DEBUG");
          }
          elt.trigger("after.success.ic", [elt, data, textStatus, xhr, requestId]);
        } catch (e) {
          log(elt, "Error processing successful request " + requestId + " : " + formatError(e), "ERROR");
        }
      },
      error: function (xhr, status, str) {
        elt.trigger("error.ic", [elt, status, str, xhr]);
        var onError = closestAttrValue(elt, 'ic-on-error');
        if(onError) {
          globalEval('(function (status, str, xhr) {' + onError + '})')(status, str, xhr);
        }
        log(elt, "AJAX request " + requestId + " experienced an error: " + str, "ERROR");
      },
      complete : function(xhr, status){
        log(elt, "AJAX request " + requestId + " completed in " + (new Date() - requestStart) + "ms", "DEBUG");
        requestCleanup(indicator, elt);
        try {
          $('body').trigger("complete.ic", [elt, data, status, xhr, requestId]);
        } catch(e) {
          log(elt, "Error during complete.ic event for " + requestId + " : " + formatError(e), "ERROR");
        }
        var onComplete = closestAttrValue(elt, 'ic-on-complete');
        if(onComplete) {
          globalEval('(function (xhr, status) {' + onComplete + '})')(xhr, status);
        }
      }
    })
  }

  function findIndicator(elt) {
    var indicator = null;
    if ($(elt).attr('ic-indicator')) {
      indicator = $($(elt).attr('ic-indicator')).first();
    } else {
      indicator = $(elt).find(".ic-indicator").first();
      if (indicator.length == 0) {
        var parent = closestAttrValue(elt, 'ic-indicator');
        if (parent) {
          indicator = $(parent).first();
        }
      }
    }
    return indicator;
  }

  function processIncludes(str) {
    var returnString = "";
    if($.trim(str).indexOf("{") == 0) {
      var obj = $.parseJSON( str );
      $.each(obj, function(key, value){
        returnString += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(value);
      });
    } else {
      $(str).each(function(){
        returnString += "&" + $(this).serialize();
      });
    }
    return returnString;
  }

  function getParametersForElement(elt, triggerOrigin) {
    var target = getTarget(elt);
    var str = "ic-request=true";

    // if the element is in a form, include the entire form
    if(elt.closest('form').length > 0) {
      str += "&" + elt.closest('form').serialize();
    } else { // otherwise include the element
      str += "&" + elt.serialize();
    }

    if (elt.attr('id')) {
      str += "&ic-element-id=" + elt.attr('id');
    }
    if (elt.attr('name')) {
      str += "&ic-element-name=" + elt.attr('name');
    }
    if (target.attr('ic-id')) {
      str += "&ic-id=" + target.attr('ic-id');
    }
    if (target.attr('id')) {
      str += "&ic-target-id=" + target.attr('id');
    }
    if (triggerOrigin && triggerOrigin.attr('id')) {
      str += "&ic-trigger-id=" + triggerOrigin.attr('id');
    }
    if (triggerOrigin && triggerOrigin.attr('name')) {
      str += "&ic-trigger-name=" + triggerOrigin.attr('name');
    }
    if (target.data('ic-last-refresh')) {
      str += "&ic-last-refresh=" + target.data('ic-last-refresh');
    }
    var includeAttr = closestAttrValue(elt, 'ic-include');
    if (includeAttr) {
      str += processIncludes(includeAttr);
    }
    str += "&ic-current-url=" + encodeURIComponent(currentUrl());
    log(elt, "request parameters " + str, "DEBUG");
    return str;
  }

  function maybeSetIntercoolerInfo(elt) {
    var target = getTarget(elt);
    getIntercoolerId(target);
    maybeSetIntercoolerMetadata(target);
    if(elt.data('elementAdded.ic') != true){
      elt.data('elementAdded.ic', true);
      elt.trigger("elementAdded.ic");
    }
  }

  function updateIntercoolerMetaData(elt) {
    elt.data('ic-last-refresh', new Date().getTime());
  }

  function maybeSetIntercoolerMetadata(elt) {
    elt.data('ic-last-refresh', new Date().getTime());
  }

  function getIntercoolerId(elt) {
    if (!elt.attr('ic-id')) {
      elt.attr('ic-id', uuid());
    }
    return elt.attr('ic-id');
  }

  //============================================================
  // Tree Processing
  //============================================================

  function processNodes(elt) {
    processMacros(elt);
    processSources(elt);
    processPolling(elt);
    processTriggerOn(elt);
    processRemoveAfter(elt);
    $(elt).trigger('nodesProcessed.ic');
  }

  function processMacros(elt) {
    $.each(_MACROS, function (i, macro) {
      if ($(elt).closest('.ic-ignore').length == 0) {
        if ($(elt).is('[' + macro + ']')) {
          processMacro(macro, $(elt));
        }
        $(elt).find('[' + macro + ']').each(function () {
          if ($(this).closest('.ic-ignore').length == 0) {
            processMacro(macro, $(this));
          }
        });
      }
    });
  }

  function processSources(elt) {
    if ($(elt).closest('.ic-ignore').length == 0) {
      if ($(elt).is("[ic-src]")) {
        maybeSetIntercoolerInfo($(elt));
      }
      $(elt).find("[ic-src]").each(function () {
        if ($(this).closest('.ic-ignore').length == 0) {
          maybeSetIntercoolerInfo($(this));
        }
      });
    }
  }

  function processPolling(elt) {
    if ($(elt).closest('.ic-ignore').length == 0) {
      if ($(elt).is('[ic-poll]')) {
        maybeSetIntercoolerInfo($(elt));
        startPolling(elt);
      }
      $(elt).find('[ic-poll]').each(function () {
        if ($(this).closest('.ic-ignore').length == 0) {
          maybeSetIntercoolerInfo($(this));
          startPolling($(this));
        }
      });
    }
  }

  function processTriggerOn(elt) {
    if ($(elt).closest('.ic-ignore').length == 0) {
      handleTriggerOn(elt);
      $(elt).find('[ic-trigger-on]').each(function () {
        if ($(this).closest('.ic-ignore').length == 0) {
          handleTriggerOn($(this));
        }
      });
    }
  }

  function processRemoveAfter(elt) {
    if ($(elt).closest('.ic-ignore').length == 0) {
      handleRemoveAfter(elt);
      $(elt).find('[ic-remove-after]').each(function () {
        if ($(this).closest('.ic-ignore').length == 0) {
          handleRemoveAfter($(this));
        }
      });
    }
  }

  //============================================================
  // Polling support
  //============================================================

  function startPolling(elt) {
    if(elt.data('ic-poll-interval-id') == null) {
      var interval = parseInterval(elt.attr('ic-poll'));
      if(interval != null) {
        var selector = icSelectorFor(elt);
        var repeats =  parseInt(elt.attr('ic-poll-repeats')) || -1;
        var currentIteration = 0;
        log(elt, "POLL: Starting poll for element " + selector, "DEBUG");
        var timerId = setInterval(function () {
          var target = $(selector);
          elt.trigger("onPoll.ic", target);
          if ((target.length == 0) || (currentIteration == repeats)) {
            log(elt, "POLL: Clearing poll for element " + selector, "DEBUG");
            clearTimeout(timerId);
          } else {
            fireICRequest(target);
          }
          currentIteration++;
        }, interval);
        elt.data('ic-poll-interval-id', timerId);
      }
    }
  }

  function cancelPolling(elt) {
    if(elt.data('ic-poll-interval-id') != null) {
      clearTimeout(elt.data('ic-poll-interval-id'));
    }
  }

  //============================================================----
  // Dependency support
  //============================================================----

  function refreshDependencies(dest, src) {
    log(src, "refreshing dependencies for path " + dest, "DEBUG");
    $('[ic-src]').each(function () {
      var fired = false;
      if(verbFor($(this)) == "GET" && $(this).attr('ic-deps') != 'ignore') {
        if (isDependent(dest, $(this).attr('ic-src'))) {
          if (src == null || $(src)[0] != $(this)[0]) {
            fireICRequest($(this));
            fired = true;
          }
        } else if (isDependent(dest, $(this).attr('ic-deps')) || $(this).attr('ic-deps') == "*") {
          if (src == null || $(src)[0] != $(this)[0]) {
            fireICRequest($(this));
            fired = true;
          }
        }
      }
      if(fired) {
        log($(this), "depends on path " + dest + ", refreshing...", "DEBUG")
      }
    });
  }

  function isDependent(src, dest) {
    return (src && dest) && (dest.indexOf(src) == 0 || src.indexOf(dest) == 0);
  }

  //============================================================----
  // Trigger-On support
  //============================================================----

  function verbFor(elt) {
    if (elt.attr('ic-verb')) {
      return elt.attr('ic-verb').toUpperCase();
    }
    return "GET";
  }

  function eventFor(attr, elt) {
    if(attr == "default") {
      if($(elt).is('button')) {
        return 'click';
      } else if($(elt).is('form')) {
        return 'submit';
      } else if($(elt).is(':input')) {
        return 'change';
      } else {
        return 'click';
      }
    } else {
      return attr;
    }
  }

  function preventDefault(elt) {
    return elt.is('form') || (elt.is(':submit') && elt.closest('form').length == 1);
  }

  function handleRemoveAfter(elt) {
    if ($(elt).attr('ic-remove-after')) {
      var interval = parseInterval($(elt).attr('ic-remove-after'));
      setTimeout(function () { remove(elt); }, interval);
    }
  }

  function handleTriggerOn(elt) {

    if ($(elt).attr('ic-trigger-on')) {
      if ($(elt).attr('ic-trigger-on') == 'load') {
        fireICRequest(elt);
      } else if ($(elt).attr('ic-trigger-on') == 'scrolled-into-view') {
        initScrollHandler();
        setTimeout(function () { $(window).trigger('scroll'); }, 100); // Trigger a scroll in case element is already viewable
      } else {
        var triggerOn = $(elt).attr('ic-trigger-on').split(" ");
        $(elt).on(eventFor(triggerOn[0], $(elt)), function (e) {

          var onBeforeTrigger = closestAttrValue(elt, 'ic-on-beforeTrigger');
          if(onBeforeTrigger) {
            if(globalEval('(function (evt, elt) {' + onBeforeTrigger + '})')(e, $(elt)) == false) {
              log($(elt), "ic-trigger cancelled by ic-on-beforeTrigger", "DEBUG");
              return;
            }
          }

          if(triggerOn[1] == 'changed') {
            var currentVal = $(elt).val();
            var previousVal = $(elt).data('ic-previous-val');
            $(elt).data('ic-previous-val', currentVal);
            if( currentVal != previousVal ) {
              fireICRequest($(elt));
            }
          } else {
            fireICRequest($(elt));
          }
          if(preventDefault(elt)){
            e.preventDefault();
            return false;
          }
          return true;
        });
      }
    }
  }

  //============================================================----
  // Macro support
  //============================================================----

  function processMacro(macro, elt) {
    // action attributes
    if(macro == 'ic-post-to') {
      setIfAbsent(elt, 'ic-src', elt.attr('ic-post-to'));
      setIfAbsent(elt, 'ic-verb', 'POST');
      setIfAbsent(elt, 'ic-trigger-on', 'default');
      setIfAbsent(elt, 'ic-deps', 'ignore');
    }
    if(macro == 'ic-put-to') {
      setIfAbsent(elt, 'ic-src', elt.attr('ic-put-to'));
      setIfAbsent(elt, 'ic-verb', 'PUT');
      setIfAbsent(elt, 'ic-trigger-on', 'default');
      setIfAbsent(elt, 'ic-deps', 'ignore');
    }
    if(macro == 'ic-get-from') {
      setIfAbsent(elt, 'ic-src', elt.attr('ic-get-from'));
      setIfAbsent(elt, 'ic-trigger-on', 'default');
      setIfAbsent(elt, 'ic-deps', 'ignore');
    }
    if(macro == 'ic-delete-from') {
      setIfAbsent(elt, 'ic-src', elt.attr('ic-delete-from'));
      setIfAbsent(elt, 'ic-verb', 'DELETE');
      setIfAbsent(elt, 'ic-trigger-on', 'default');
      setIfAbsent(elt, 'ic-deps', 'ignore');
    }
    // non-action attributes
    var value = null;
    var url = null;
    if(macro == 'ic-style-src') {
      value = elt.attr('ic-style-src').split(":");
      var styleAttribute = value[0];
      url = value[1];
      setIfAbsent(elt, 'ic-src', url);
      setIfAbsent(elt, 'ic-target', 'this.style.' + styleAttribute);
    }
    if(macro == 'ic-attr-src') {
      value = elt.attr('ic-attr-src').split(":");
      var attribute = value[0];
      url = value[1];
      setIfAbsent(elt, 'ic-src', url);
      setIfAbsent(elt, 'ic-target', 'this.' + attribute);
    }
    if(macro == 'ic-prepend-from') {
      setIfAbsent(elt, 'ic-src', elt.attr('ic-prepend-from'));
    }
    if(macro == 'ic-append-from') {
      setIfAbsent(elt, 'ic-src', elt.attr('ic-append-from'));
    }
  }

  function setIfAbsent(elt, attr, value) {
    if(elt.attr(attr) == null) {
      elt.attr(attr, value);
    }
  }

  //============================================================----
  // Utilities
  //============================================================----

  function isScrolledIntoView(elem) {
    var docViewTop = $(window).scrollTop();
    var docViewBottom = docViewTop + $(window).height();

    var elemTop = $(elem).offset().top;
    var elemBottom = elemTop + $(elem).height();

    return ((elemBottom >= docViewTop) && (elemTop <= docViewBottom)
      && (elemBottom <= docViewBottom) && (elemTop >= docViewTop));
  }

  function maybeScrollToTarget(elt, target) {
    if(closestAttrValue(elt, 'ic-scroll-to-target') == 'true' ||
      closestAttrValue(target, 'ic-scroll-to-target') == 'true') {
      var offset = -50; // -50 px default offset padding
      if(closestAttrValue(elt, 'ic-scroll-offset')) {
        offset = parseInt(closestAttrValue(elt, 'ic-scroll-offset'));
      } else if(closestAttrValue(target, 'ic-scroll-offset')) {
        offset = parseInt(closestAttrValue(target, 'ic-scroll-offset'));
      }
      var currentPosition = target.offset().top;
      var portalTop = $(window).scrollTop();
      var portalEnd = portalTop + window.innerHeight;
      //if the current top of this element is not visible, scroll it to the top position
      if(currentPosition < portalTop || currentPosition > portalEnd) {
        offset += currentPosition;
        $('html,body').animate({scrollTop: offset}, 400);
      }
    }
  }

  function getTransitionDurationString(elt, target) {
    var transitionDuration = closestAttrValue(elt, 'ic-transition-duration');
    if(transitionDuration) {
      return transitionDuration;
    }
    transitionDuration = closestAttrValue(target, 'ic-transition-duration');
    if(transitionDuration) {
      return transitionDuration;
    }
    return $(target).css('transition-duration');
  }

  function processICResponse(responseContent, elt) {
    if (responseContent && /\S/.test(responseContent)) {

      log(elt, "response content: \n" + responseContent, "DEBUG");
      var target = getTarget(elt);

      var contentToSwap = maybeFilter(responseContent, closestAttrValue(elt, 'ic-select-from-response'));

      var doSwap = function () {
        if (closestAttrValue(elt, 'ic-replace-target') == "true") {
          target.replaceWith(contentToSwap);
          processNodes(contentToSwap);
          updateIntercoolerMetaData(contentToSwap);
          updateIntercoolerMetaData(contentToSwap);
          maybeScrollToTarget(elt, contentToSwap);
        } else {
          if (elt.is('[ic-prepend-from]')) {
            prepend(target, contentToSwap);
          } else if (elt.is('[ic-append-from]')) {
            append(target, contentToSwap);
          } else {
            target.empty().append(contentToSwap);
            $(target).children().each(function () {
              processNodes($(this));
            });
          }
          updateIntercoolerMetaData(target);
          maybeScrollToTarget(elt, target)
        }
      };

      var transitionDuration = getTransitionDurationString(elt, target);
      var delay = parseInterval(transitionDuration);
      if(delay > 0) {
        target.addClass('ic-transitioning');
        setTimeout(function(){
          doSwap();
          setTimeout(function(){
            target.removeClass('ic-transitioning');
          }, 5);
        }, delay);
      } else {
        // swap immediately
        doSwap();
      }
    }
  }

  function maybeFilter(newContent, filter) {
    var content = $.parseHTML(newContent, null, true);
    var asQuery = $(content);
    if(filter) {
      if(!asQuery.is(filter)) {
        asQuery = asQuery.find(filter);
      }
    }
    return asQuery;
  }

  function getStyleTarget(elt) {
    var val = closestAttrValue(elt, 'ic-target');
    if(val && val.indexOf("this.style.") == 0) {
      return val.substr(11)
    } else {
      return null;
    }
  }

  function getAttrTarget(elt) {
    var val = closestAttrValue(elt, 'ic-target');
    if(val && val.indexOf("this.") == 0) {
      return val.substr(5)
    } else {
      return null;
    }
  }

  function fireICRequest(elt, alternateHandler) {

    var triggerOrigin = elt;
    if(!elt.is('[ic-src]')) {
      elt = elt.closest('[ic-src]');
    }

    var confirmText = closestAttrValue(elt, 'ic-confirm');
    if(confirmText) {
      if(!confirm(confirmText)) {
        return;
      }
    }

    if(elt.length > 0) {
      var icEventId = uuid();
      elt.data('ic-event-id', icEventId);
      var invokeRequest = function () {

        // if an existing request is in flight for this element, push this request as the next to be executed
        if(elt.data('ic-request-in-flight') == true) {
          elt.data('ic-next-request', invokeRequest);
          return;
        }

        if (elt.data('ic-event-id') == icEventId) {
          var styleTarget = getStyleTarget(elt);
          var attrTarget = styleTarget ? null : getAttrTarget(elt);
          var verb = verbFor(elt);

          var success = alternateHandler || function (data) {
            if (styleTarget) {
              elt.css(styleTarget, data);
            } else if (attrTarget) {
              elt.attr(attrTarget, data);
            } else {
              processICResponse(data, elt);
              if (verb != 'GET') {
                refreshDependencies(elt.attr('ic-src'), elt);
              }
            }
          };

          handleRemoteRequest(elt, verb, elt.attr('ic-src'), getParametersForElement(elt, triggerOrigin), success);
        }
      };

      var triggerDelay = closestAttrValue(elt, 'ic-trigger-delay');
      if (triggerDelay) {
        setTimeout(invokeRequest, parseInterval(triggerDelay));
      } else {
        invokeRequest();
      }
    }
  }

  //============================================================
  // History Support
  //============================================================

  var _historySupport = {

    currentRestorationId : null,
    // limit history slots to 200 total by default
    historyLimit : 200,

    clearHistory: function() {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++){
        if(localStorage.key(i).indexOf("ic-hist-elt-") == 0) {
          keys.push(localStorage.key(i));
        }
      }
      for (var j = 0; j < keys.length; j++){
        localStorage.removeItem(keys[j]);
      }
      localStorage.removeItem('ic-history-support');
    },

    newRestorationData : function(id, html){
      var histSupport = JSON.parse(localStorage.getItem('ic-history-support'));

      if (histSupport == null || !("slot" in histSupport)) {
        _historySupport.clearHistory();
        histSupport = {
          slot : 0
        };
      }

      var restorationDataId = "ic-hist-elt-";
      if(histSupport.slot < 10) {
        restorationDataId += "00" + histSupport.slot;
      } else if (histSupport.slot < 100) {
        restorationDataId += "0" + histSupport.slot;
      } else  {
        restorationDataId += histSupport.slot;
      }
      var restorationData = {
        "id": restorationDataId,
        "elementId": id,
        "content": html,
        "timestamp": new Date().getTime()
      };

      histSupport.slot = (histSupport.slot + 1) % _historySupport.historyLimit;

      //save the new element and history support data
      localStorage.setItem(restorationData.id, JSON.stringify(restorationData));
      localStorage.setItem('ic-history-support', JSON.stringify(histSupport));
      return restorationData;
    },

    updateHistoryData : function(id, html){
      var restorationData = JSON.parse(localStorage.getItem(id));
      if (restorationData == null) {
        log($('body'), "Could not find restoration data with id " + id, "ERROR");
        return
      }
      restorationData.content = html;
      //save the new element and history support data
      localStorage.setItem(restorationData.id, JSON.stringify(restorationData));
    },

    onPageLoad: function () {
      if (window.onpopstate == null || window.onpopstate['ic-on-pop-state-handler'] != true) {
        var currentOnPopState = window.onpopstate;
        window.onpopstate = function(event) {
          $('body').trigger('handle.onpopstate.ic');
          if(!_historySupport.handlePop(event)){
            if(currentOnPopState) {
              currentOnPopState(event);
            }
          }
          $('body').trigger('pageLoad.ic');
        };
        window.onpopstate['ic-on-pop-state-handler'] = true;
      }
    },

    pushUrl: function (url, elt, target, originalHtml) {
      log(elt, "pushing location into history: " + url, "DEBUG");

      var id = target.attr('id');
      if(id == null) {
        log(target, "To support history for a given element, you must have a valid id attribute on the element", "ERROR");
        return;
      }

      // If we have a current restoration ID (i.e. we are working in a restored location)
      // we can update it with the current HTML in order to capture internal mutations
      if(_historySupport.currentRestorationId != null) {
        _historySupport.updateHistoryData(_historySupport.currentRestorationId, originalHtml);
      } else {
        // Otherwise this is the first time we've initiated AJAX history so we need to
        // create a new history element with the original HTML for the element so the
        // back button works for the original page
        var originalData = _historySupport.newRestorationData(id, originalHtml);
        window.history.replaceState({"ic-id" : originalData.id}, "", "");
      }

      // Finally push the new content in as a new history element (insanity)
      var restorationData = _historySupport.newRestorationData(id, target.html());
      window.history.pushState({'ic-id': restorationData.id}, "", url);
      _historySupport.currentRestorationId = restorationData.id;
      target.trigger("pushUrl.ic", target, restorationData);
    },

    handlePop: function (event) {
      var data = event.state;
      if (data && data['ic-id']) {
        var historyData = JSON.parse(localStorage.getItem(data['ic-id']));
        if(historyData) {
          var elt = findById(historyData["elementId"]);
          if(_historySupport.currentRestorationId != null) {
            elt.trigger("beforeHistorySnapshot.ic", [elt, elt]);
            _historySupport.updateHistoryData(_historySupport.currentRestorationId, elt.html());
          }
          processICResponse(historyData["content"], elt);
          _historySupport.currentRestorationId = historyData.id;
          return true;
        }
      }
      return false;
    }
  };

  //============================================================
  // Local references transport
  //============================================================

  $.ajaxTransport("text",  function(options, origOptions, jqXHR) {
      if (origOptions.url[0]=="#") {
        var ltAttr="ic-local-";
        var src=$(origOptions.url);
        var rsphdr=[];
        var status=200;
        var statusText="OK";
        src.each(function(i, el) {
          $.each(el.attributes, function(j, attr) {
            if (attr.name.substr(0,ltAttr.length) == ltAttr) {
              var lhName=attr.name.substring(ltAttr.length);
              if (lhName == "status") {
                var statusLine=attr.value.match(/(\d+)\s?(.*)/);
                if (statusLine != null) {
                  status=statusLine[1];
                  statusText=statusLine[2];
                } else {
                  status="500";
                  statusText="Attribute Error";
                }
              } else {
                rsphdr.push(lhName+": "+attr.value);
              }
            }
          });
        });
        var rsp=src.length > 0 ? src.html() : "";
        return {
          send: function(reqhdr, completeCallback) {
            completeCallback(status, statusText, {html: rsp}, rsphdr.join("\n"));
          },
          abort: function() {}
        }
      } else {
        return null;
      }
    }
  );

  //============================================================
  // Bootstrap
  //============================================================

  $(function () {
    processNodes('body');
    _historySupport.onPageLoad();
    if(location.search && location.search.indexOf("ic-launch-debugger=true") >= 0) {
      Intercooler.debug();
    }
  });

  /* ===================================================
   * JS API
   * =================================================== */
  return {
    refresh: function (val) {
      if (typeof val == 'string' || val instanceof String) {
        refreshDependencies(val);
      } else {
        fireICRequest(val);
      }
      return Intercooler;
    },

    updateHistory: function(id) {
      var restoData = _historySupport.newRestorationData($(id).attr('id'), $(id).html());
      window.history.replaceState({"ic-id" : restoData.id}, "", "");
    },

    dumpLocalStorage : function() {
      var keys = [];
      for (var x in localStorage) {
        keys.push(x);
      }
      keys.sort();
      var total = 0;
      for(var i in keys) {
        var size = (localStorage[keys[i]].length * 2);
        total += size;
        console.log(keys[i] + "=" + (size / 1024 / 1024).toFixed(2) + " MB")
      }
      console.log("TOTAL LOCAL STORAGE: " + (total / 1024 / 1024).toFixed(2) + " MB")
    },

    resetHistory: function() {
      _historySupport.clearHistory();
    },

    setHistoryLimit: function(count) {
      _historySupport.historyLimit = count;
    },

    fireRequest: function(elt, callback) {
      fireICRequest(elt, callback)
    },

    processNodes: function(elt) {
      return processNodes(elt);
    },

    closestAttrValue: function (elt, attr) {
      return closestAttrValue(elt, attr);
    },

    verbFor: function(elt) {
      return verbFor(elt);
    },

    isDependent: function(src, dest) {
      return isDependent(src, dest);
    },

    getTarget: function(elt) {
      return getTarget(elt);
    },

    debug: function() {
      var debuggerUrl = closestAttrValue('body', 'ic-debugger-url') ||
        "https://intercoolerreleases-leaddynocom.netdna-ssl.com/intercooler-debugger.js";
      $.getScript(debuggerUrl)
        .fail(function (jqxhr, settings, exception) {
          log($('body'), formatError(exception), "ERROR");
        });
    }
  }
})();
