/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

var app = {

    printerConnected: true,

    // Application Constructor
    initialize: function() {
        document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
        snap.addEventListener('click', this.takePicture.bind(this), false);
        album.addEventListener('click', this.openPicture.bind(this), false);
        $('button[data-page]').click(this.go);
        $('a[data-page]').click(this.go);
    },

    // deviceready Event Handler
    // 'pause', 'resume', etc.
    onDeviceReady: function() {
        this.receivedEvent('deviceready');
        this.checkPrinterConnection();
    },

    // Update DOM on a Received Event
    receivedEvent: function(id) {
        
        console.log('Received Event: ' + id);
    },

    cameraSuccess: function(imageData) {
        var base64data = "data:image/jpeg;base64," + imageData;
        $('#cameraPreview').css('backgroud-image', 'url('+ base64data+')').removeClass('d-none');
        //https://github.com/jankovicsandras/imagetracerjs
        ImageTracer.imageToSVG(base64data, function(svgstr) {
            console.log(svgstr);
            $('#svgPreview').removeClass('d-none').append(svgstr);
        });
    },

    cameraError: function(x) {
        console.log('cameraError');
        console.log(x);
    },
    
    takePicture: function(x) {
        navigator.camera.getPicture(app.cameraSuccess, app.cameraError, {
            quality: 70,
        });
    },

    openPicture: function(x) {   
        navigator.camera.getPicture(app.cameraSuccess, app.cameraError, {
            quality: 70,
            sourceType: Camera.PictureSourceType.SAVEDPHOTOALBUM,
        });
    },

    go: function(e) {   
        app.checkPrinterConnection();
        var target = $(e.target); 
        if (!target.attr('data-page')) target = target.closest('[data-page]');
        var pgname = '#page-' + target.data('page');
        $('.page').addClass('d-none');
        $(pgname).removeClass('d-none');
    },

    checkPrinterConnection: function() {
        if (app.printerConnected) {
            $('.needs-connection').prop('disabled', false);
            $('.no-connection-msg').addClass('d-none');
            $('#btn-connect span').html(" Manage");
            $('#btn-connect').removeClass('btn-outline-danger');
            $('#btn-connect').removeClass('pulse-border');
            $('#btn-connect').addClass('btn-outline-success');
        } else {
            $('.needs-connection').prop('disabled', true);
            $('.no-connection-msg').removeClass('d-none');
            $('#btn-connect span').html(" Connect");
            $('#btn-connect').removeClass('btn-outline-success');
            $('#btn-connect').addClass('pulse-border');
            $('#btn-connect').addClass('btn-outline-danger');
        }
        
    }
};

app.initialize();