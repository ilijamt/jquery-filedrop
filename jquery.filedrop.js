/*global jQuery:false, alert:false */

/*
 * Default text - jQuery plugin for html5 dragging files from desktop to browser
 *
 * Author: Weixi Yen
 *
 * Email: [Firstname][Lastname]@gmail.com
 *
 * Copyright (c) 2010 Resopollution
 *
 * Licensed under the MIT license:
 *   http://www.opensource.org/licenses/mit-license.php
 *
 * Project home:
 *   http://www.github.com/weixiyen/jquery-filedrop
 *
 * Version:  0.1.0
 *
 * Features:
 *      Allows sending of extra parameters with file.
 *      Works with Firefox 3.6+
 *      Future-compliant with HTML5 spec (will work with Webkit browsers and IE9)
 * Usage:
 *  See README at project homepage
 *
 */
;
(function($) {
    "use strict";

    jQuery.event.props.push("dataTransfer");

    var default_opts = {
        timeoutLeave: 100,
        element: null,
        fallback_id: '',
        url: '',
        refresh: 1000,
        paramname: 'document',
        requestType: 'POST',    // just in case you want to use another HTTP verb
        allowedfileextensions: [],
        allowedfiletypes: [],
        maxfiles: 5,           // Ignored if queuefiles is set > 0
        maxfilesize: 10,         // MB file size limit
        queuefiles: 0,          // Max files before queueing (for large volume uploads)
        queuewait: 200,         // Queue wait time if full
        data: {},
        headers: {},
        drop: empty,
        dragStart: empty,
        dragEnter: empty,
        dragOver: empty,
        dragLeave: empty,
        docEnter: empty,
        docOver: empty,
        docLeave: empty,
        docDrop: empty,
        beforeEach: empty,
        afterAll: empty,
        rename: empty,
        confirm: function() {
            return true;
        },
        error: function(err, file, i, status) {
            alert(err);
        },
        uploadStarted: empty,
        uploadFinished: empty,
        progressUpdated: empty,
        globalProgressUpdated: empty,
        speedUpdated: empty,
        sendBoundary: (window.FormData || $.browser.mozilla),
        bindOnContainerClick: false,
        hideFallbackElement: true,
        autoStartUpload: true,
        triggerStartUploadEvent: 'triggerUploadManually'
    },
    errors = ["BrowserNotSupported", "TooManyFiles", "FileTooLarge", "FileTypeNotAllowed", "NotFound", "NotReadable", "AbortError", "ReadError", "FileExtensionNotAllowed"];

    $.fn.filedrop = function(options) {
        var opts = $.extend({}, default_opts, options),
                global_progress = [],
                doc_leave_timer, stop_loop = false,
                files_count = 0,
                files;

        var self = this;

        this.on('drop', drop).on('dragstart', opts.dragStart).on('dragenter', dragEnter).on('dragover', dragOver).on('dragleave', dragLeave);
        $(document).on('drop', docDrop).on('dragenter', docEnter).on('dragover', docOver).on('dragleave', docLeave);

        this.on(opts.triggerStartUploadEvent, function() {

            if (opts.autoStartUpload) {
                return;
            }

            upload.call(self);
        });

        // We want to hide the fallback
        if (opts.hideFallbackElement) {
            $('#' + opts.fallback_id).css({
                display: 'none',
                width: 0,
                height: 0
            });
        }

        // the HTML element
        opts.element = this;

        if (opts.bindOnContainerClick) {
            this.on('click', function(e) {
                $('#' + opts.fallback_id).trigger(e);
            });
        }

        $('#' + opts.fallback_id).change(function(e) {
            opts.drop(e);
            files = e.target.files;
            files_count = files.length;
            if (opts.autoStartUpload) {
                upload.call(self);
            }
        });

        function drop(e) {

            if (opts.drop.call(this, e) === false)
                return false;

            if (!e.dataTransfer)
                return;

            files = e.dataTransfer.files;
            if (files === null || files === undefined || files.length === 0) {
                opts.error(errors[0]);
                return false;
            }

            files_count = files.length;
            if (opts.confirm.call(this, e) === true) {
                upload.call(this);
                e.preventDefault();
            }

            return false;
        }

        function getBuilder(filename, filedata, mime, boundary) {
            var dashdash = '--',
                    crlf = '\r\n',
                    builder = '',
                    paramname = opts.paramname;

            filename = encodeURIComponent(filename);

            if (opts.data) {
                var params = $.param(opts.data).replace(/\+/g, '%20').split(/&/);

                $.each(params, function() {
                    var pair = this.split("=", 2),
                            name = decodeURIComponent(pair[0]),
                            val = decodeURIComponent(pair[1]);

                    if (pair.length !== 2) {
                        return;
                    }
                    builder += dashdash;
                    builder += boundary;
                    builder += crlf;
                    builder += 'Content-Disposition: form-data; name="' + name + '"';
                    builder += crlf;
                    builder += crlf;
                    builder += val;
                    builder += crlf;
                });
            }

            if (jQuery.isFunction(paramname)) {
                paramname = paramname(filename);
            }

            builder += dashdash;
            builder += boundary;
            builder += crlf;
            builder += 'Content-Disposition: form-data; name="' + (paramname || "") + '"';
            builder += '; filename="' + filename + '"';
            builder += crlf;

            builder += 'Content-Type: ' + mime;
            builder += crlf;
            builder += crlf;

            builder += filedata;
            builder += crlf;

            builder += dashdash;
            builder += boundary;
            builder += dashdash;
            builder += crlf;
            return builder;
        }

        function progress(e) {
            if (e.lengthComputable) {
                var percentage = Math.round((e.loaded * 100) / e.total);
                if (this.currentProgress !== percentage) {

                    this.currentProgress = percentage;
                    opts.progressUpdated(this.index, this.file, this.currentProgress);

                    global_progress[this.global_progress_index] = this.currentProgress;
                    globalProgress();

                    var elapsed = new Date().getTime();
                    var diffTime = elapsed - this.currentStart;
                    if (diffTime >= opts.refresh) {
                        var diffData = e.loaded - this.startData;
                        var speed = diffData / diffTime; // KB per second
                        opts.speedUpdated(this.index, this.file, speed);
                        this.startData = e.loaded;
                        this.currentStart = elapsed;
                    }
                }
            }
        }

        function globalProgress() {
            if (global_progress.length === 0) {
                return;
            }

            var total = 0, index;
            for (index in global_progress) {
                if (global_progress.hasOwnProperty(index)) {
                    total = total + global_progress[index];
                }
            }

            opts.globalProgressUpdated(Math.round(total / global_progress.length));
        }

        // Respond to an upload
        function upload() {
            stop_loop = false;

            if (!files) {
                opts.error(errors[0]);
                return false;
            }

            if (opts.allowedfiletypes.push && opts.allowedfiletypes.length) {
                for (var fileIndex = files.length; fileIndex--; ) {
                    if (!files[fileIndex].type || $.inArray(files[fileIndex].type, opts.allowedfiletypes) < 0) {
                        opts.error(errors[3], files[fileIndex]);
                        return false;
                    }
                }
            }

            if (opts.allowedfileextensions.push && opts.allowedfileextensions.length) {
                for (var fileIndex = files.length; fileIndex--; ) {
                    var allowedextension = false, leftName, rightName;
                    for (i = 0; i < opts.allowedfileextensions.length; i++) {
                        leftName = files[fileIndex].name.substr(files[fileIndex].name.length - opts.allowedfileextensions[i].length).toLowerCase();
                        rightName = opts.allowedfileextensions[i].toLowerCase();
                        if (leftName === rightName) {
                            allowedextension = true;
                        }
                    }
                    if (!allowedextension) {
                        opts.error(errors[8], files[fileIndex]);
                        return false;
                    }
                }
            }

            var filesDone = 0,
                    filesRejected = 0;

            if (files_count > opts.maxfiles && opts.queuefiles === 0) {
                opts.error(errors[1]);
                return false;
            }

            // Define queues to manage upload process
            var workQueue = [];
            var processingQueue = [];
            var doneQueue = [];

            // Add everything to the workQueue
            for (var i = 0; i < files_count; i++) {
                workQueue.push(i);
            }

            // Helper function to enable pause of processing to wait
            // for in process queue to complete
            var pause = function(timeout) {
                setTimeout(process, timeout);
                return;
            };

            // Process an upload, recursive
            var process = function() {

                var fileIndex;

                if (stop_loop) {
                    return false;
                }

                // Check to see if are in queue mode
                if (opts.queuefiles > 0 && processingQueue.length >= opts.queuefiles) {
                    return pause.call(this, opts.queuewait);
                } else {
                    // Take first thing off work queue
                    fileIndex = workQueue[0];
                    workQueue.splice(0, 1);

                    // Add to processing queue
                    processingQueue.push(fileIndex);
                }

                try {
                    if (beforeEach(files[fileIndex]) !== false) {
                        if (fileIndex === files_count) {
                            return;
                        }
                        var reader = new FileReader(),
                                max_file_size = 1048576 * opts.maxfilesize;

                        reader.index = fileIndex;
                        if (files[fileIndex].size > max_file_size) {
                            opts.error(errors[2], files[fileIndex], fileIndex);
                            // Remove from queue
                            processingQueue.forEach(function(value, key) {
                                if (value === fileIndex) {
                                    processingQueue.splice(key, 1);
                                }
                            });
                            filesRejected++;
                            return true;
                        }

                        reader.onerror = function(e) {
                            switch (e.target.error.code) {
                                case e.target.error.NOT_FOUND_ERR:
                                    opts.error(errors[4]);
                                    return false;
                                case e.target.error.NOT_READABLE_ERR:
                                    opts.error(errors[5]);
                                    return false;
                                case e.target.error.ABORT_ERR:
                                    opts.error(errors[6]);
                                    return false;
                                default:
                                    opts.error(errors[7]);
                                    return false;
                            }
                        };

                        reader.onloadend = !opts.beforeSend ? send : function(e) {
                            opts.beforeSend(files[fileIndex], fileIndex, function() {
                                send(e);
                            });
                        };

                        reader.readAsDataURL(files[fileIndex]);

                    } else {
                        filesRejected++;
                    }
                } catch (err) {
                    // Remove from queue
                    processingQueue.forEach(function(value, key) {
                        if (value === fileIndex) {
                            processingQueue.splice(key, 1);
                        }
                    });
                    opts.error(errors[0]);
                    return false;
                }

                // If we still have work to do,
                if (workQueue.length > 0) {
                    process.call(this);
                }
            };

            var send = function(e) {

                var fileIndex = ((typeof (e.srcElement) === "undefined") ? e.target : e.srcElement).index;

                // Sometimes the index is not attached to the
                // event object. Find it by size. Hack for sure.
                if (e.target.index === undefined) {
                    e.target.index = getIndexBySize(e.total);
                }

                var xhr = new XMLHttpRequest(),
                        upload = xhr.upload,
                        file = files[e.target.index],
                        index = e.target.index,
                        start_time = new Date().getTime(),
                        boundary = '------multipartformboundary' + (new Date()).getTime(),
                        global_progress_index = global_progress.length,
                        builder,
                        newName = rename(file.name),
                        mime = file.type;

                if (opts.withCredentials) {
                    xhr.withCredentials = opts.withCredentials;
                }

                upload.index = index;
                upload.file = file;
                upload.downloadStartTime = start_time;
                upload.currentStart = start_time;
                upload.currentProgress = 0;
                upload.global_progress_index = global_progress_index;
                upload.startData = 0;
                upload.addEventListener("progress", progress, false);

                // Allow url to be a method
                if (jQuery.isFunction(opts.url)) {
                    xhr.open(opts.requestType, opts.url.call(this, file), true);
                } else {
                    xhr.open(opts.requestType, opts.url, true);
                }

                // Add headers
                $.each(opts.headers, function(k, v) {
                    xhr.setRequestHeader(k, v);
                });

                var paramname = opts.paramname;

                if (jQuery.isFunction(paramname)) {
                    paramname = paramname(file);
                }

                if (opts.sendBoundary) {
                    // we use browsers native functionality
                    var f = new FormData();

                    f.append(paramname, file);
                    $.each(opts.data, function(k, v) {
                        f.append(k, v);
                    });
                    xhr.send(f);
                } else {
                    xhr.setRequestHeader('content-type', 'multipart/form-data; boundary=' + boundary);
                    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");

                    var data = atob(e.target.result.split(',')[1]);
                    if (typeof newName === "string") {
                        builder = getBuilder(newName, data, mime, boundary);
                    } else {
                        builder = getBuilder(file.name, data, mime, boundary);
                    }
                    // we need to simulate the browser native functionality
                    var boundary = '------multipartformboundary' + (new Date()).getTime();
                    xhr.setRequestHeader('content-type', 'multipart/form-data; boundary=' + boundary);
                    if (typeof newName === "string") {
                        builder = getBuilder(newName, e.target.result, mime, boundary);
                    } else {
                        builder = getBuilder(file.name, e.target.result, mime, boundary);
                    }
                    xhr.sendAsBinary(builder);
                }

                global_progress[global_progress_index] = 0;
                globalProgress();

                opts.uploadStarted(index, file, files_count);

                xhr.onload = function() {
                    var serverResponse = null;

                    if (xhr.responseText) {
                        try {
                            serverResponse = jQuery.parseJSON(xhr.responseText);
                        }
                        catch (e) {
                            serverResponse = xhr.responseText;
                        }
                    }

                    var now = new Date().getTime(),
                            timeDiff = now - start_time,
                            result = opts.uploadFinished(index, file, serverResponse, timeDiff, xhr);
                    filesDone++;

                    // Remove from processing queue
                    processingQueue.forEach(function(value, key) {
                        if (value === fileIndex) {
                            processingQueue.splice(key, 1);
                        }
                    });

                    // Add to donequeue
                    doneQueue.push(fileIndex);

                    // Make sure the global progress is updated
                    global_progress[global_progress_index] = 100;
                    globalProgress();

                    if (filesDone === (files_count - filesRejected)) {
                        afterAll();
                    }
                    if (result === false) {
                        stop_loop = true;
                    }

                    // Pass any errors to the error option
                    if (xhr.status < 200 || xhr.status > 299) {
                        opts.error(xhr.statusText, file, fileIndex, xhr.status);
                    }
                };
            };

            // Initiate the processing loop
            process.call(this);
        }

        function getIndexBySize(size) {
            for (var i = 0; i < files_count; i++) {
                if (files[i].size === size) {
                    return i;
                }
            }

            return undefined;
        }

        function rename(name) {
            return opts.rename(name);
        }

        function beforeEach(file) {
            return opts.beforeEach(file);
        }

        function afterAll() {
            return opts.afterAll();
        }

        function dragEnter(e) {
            clearTimeout(doc_leave_timer);
            e.preventDefault();
            opts.dragEnter.call(this, e);
        }

        function dragOver(e) {
            clearTimeout(doc_leave_timer);
            e.preventDefault();
            opts.docOver.call(this, e);
            opts.dragOver.call(this, e);
        }

        function dragLeave(e) {
            clearTimeout(doc_leave_timer);
            opts.dragLeave.call(this, e);
            e.stopPropagation();
        }

        function docDrop(e) {
            clearTimeout(doc_leave_timer);
            e.preventDefault();
            opts.docDrop.call(this, e);
            opts.docLeave.call(this, e);
            opts.dragLeave.call(this, e);
            e.stopPropagation();
            return false;
        }

        function docEnter(e) {
            clearTimeout(doc_leave_timer);
            e.preventDefault();
            opts.docEnter.call(this, e);
            return false;
        }

        function docOver(e) {
            clearTimeout(doc_leave_timer);
            e.preventDefault();
            opts.docOver.call(this, e);
            return false;
        }

        function docLeave(e) {
            doc_leave_timer = setTimeout((function(_this) {
                return function() {
                    opts.docLeave.call(_this, e);
                };
            })(this), opts.timeoutLeave);
        }

        return this;
    };

    function empty() {
    }

    try {
        if (XMLHttpRequest.prototype.sendAsBinary) {
            return;
        }

        XMLHttpRequest.prototype.sendAsBinary = function(datastr) {
            function byteValue(x) {
                return x.charCodeAt(0) & 0xff;
            }
            var ords = Array.prototype.map.call(datastr, byteValue);
            var ui8a = new Uint8Array(ords);
            // Not pretty: Chrome 22 deprecated sending ArrayBuffer, moving instead
            // to sending ArrayBufferView.  Sadly, no proper way to detect this
            // functionality has been discovered.  Happily, Chrome 22 also introduced
            // the base ArrayBufferView class, not present in Chrome 21.
            if ('ArrayBufferView' in window)
                this.send(ui8a);
            else
                this.send(ui8a.buffer);
        };
    } catch (e) {
    }

})(jQuery);