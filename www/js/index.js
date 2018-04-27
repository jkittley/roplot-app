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

// register component to use
Vue.component('icon', VueAwesome)

// Printer list item
Vue.component('printer-item', {
    props: ['printer'],
    template: '#template-print-item',
    methods: {
        toggleConnect() {
            if (!this.printer.isConnected) {
                app.connectToPrinter(this.printer);
            } else {
                app.disconnectPrinter();
            }
            
        }
    }
});

// Connected button
Vue.component('btn-is-connected', {
    props: ['printer'],
    computed: {
        isConnected() {
            return (this.printer !== null);
        }
    },
    template: '#template-btn-printer-connect',
    methods: {
        showPrinterList() {
         app.showPrinterList(true);
        }
    }
});

// Connected button
Vue.component('btn-refresh-printers', {
    props: ['isScanning'],
    template: '#template-btn-printer-refresh',
    methods: {
        refresh() {
            app.fetchPrinters();
        }
    }
});


// Connected button
Vue.component('roplot-vis', {
    props: ['config', 'printer'],
    template: '#template-printer-vis',
    data: function() { return {
        roplotter: null,
        hasConfig: false
    }},
    watch: {
        config: function() {
            this.hasConfig = (this.config!==null);
            if (this.hasConfig) this.initPlot();
        }
    },
    methods: {
        initPlot() {
            var min = Math.min($('#vis').width(), $('#vis').height());
            $('#vis').height(min).width(min);;
            this.roplotter = $('#vis').roplot(this.printer.config).on('click', function(e, details) { console.log(details); });
        }
    }
});


// Main app
var app = new Vue({
    el: '#vueapp',
    created () {
        this.printerManager = new PrintManager();
        this.printerManager.addListener('printerConfig', function(eventData) {
            this.printerConfig = eventData;
        }.bind(this));
    },
    data: {
        printerManager: null,
        printers: [],
        printerConfig: null,
        visiblePrinterList: false,
    },
    computed: {
        isScanningForPrinters() { return this.printerManager.isScanning; },
        selectedPrinter() { return this.printerManager.getPrinter();  }
    },
    methods: {
        showPrinterList(showState) {
            if (showState && this.selectedPrinter===null) this.fetchPrinters();
            this.visiblePrinterList = showState;
        },
        closePrinterList() {
            this.visiblePrinterList = false;
        },
        fetchPrinters () {
            this.printers = [];
            this.printerManager.scan(
                function(printer) { // found a device
                    this.printers.push(printer);
                }.bind(this),
                function(error) { // Error
                    alert("Scan Error", error);
                }.bind(this),
                function() { // Scan complete
       
                }.bind(this)
            );            
        },
        connectToPrinter(printer) {
            this.isScanningForPrinters = false;
            console.log("Connecting");
            var process = function() {
                this.printerManager.connectTo(
                    printer,
                    function() { // Connect success
                        this.selectedPrinter = printer;
                        this.showPrinterList(false);
                    }.bind(this), 
                    function() { // Connect failed
                        alert("Connection Error", "Connection to the printer failed.");
                    }.bind(this)
                ); 
            }.bind(this);
            // If there is a printer connected then disconnect it first
            if (this.selectedPrinter!==null) {
                this.printerManager.disconnectPrinter(process);
            } else {
                process();
            }            
        },
        disconnectPrinter() {
            this.isScanningForPrinters = false;
            console.log("Disconnecting");
            this.printerManager.disconnectPrinter(function() {
                this.selectedPrinter = null;
                this.printerConfig = null;
                this.fetchPrinters();
            }.bind(this));
        }
    }
  })



// var app = {

//     printerManager: null,

//     // Application Constructor
//     initialize: function() {
//         // document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
//         // snap.addEventListener('click', this.takePicture.bind(this), false);
//         // album.addEventListener('click', this.openPicture.bind(this), false);

//         // buttonRefreshPrinterList.addEventListener('click', this.printersScanStart.bind(this), false);
//         // printerControlDisconnect.addEventListener('click', this.disconnectPrinter.bind(this), false);

//         // printerRequestConfig.addEventListener('click', this.printerNowConnected.bind(this), false);

//         // $('button[data-page]').click(this.go);
//         // $('a[data-page]').click(this.go);

//         
//     },

//     // deviceready Event Handler
//     // 'pause', 'resume', etc.
//     onDeviceReady: function() {
//         this.receivedEvent('deviceready');
//         this.checkPrinterConnection();

       

//     },

//     

//     // Update DOM on a Received Event
//     receivedEvent: function(id) {
//         console.log('Received Event: ' + id);
//     },

//     cameraSuccess: function(imageData) {
//         var base64data = "data:image/jpeg;base64," + imageData;
//         $('#cameraPreview').css('backgroud-image', 'url('+ base64data+')').removeClass('d-none');
//         //https://github.com/jankovicsandras/imagetracerjs
//         ImageTracer.imageToSVG(base64data, function(svgstr) {
//             console.log(svgstr);
//             $('#svgPreview').removeClass('d-none').append(svgstr);
//         });
//     },

//     cameraError: function(x) {
//         console.log('cameraError');
//         console.log(x);
//     },
    
//     takePicture: function(x) {
//         navigator.camera.getPicture(app.cameraSuccess, app.cameraError, {
//             quality: 70,
//         });
//     },

//     openPicture: function(x) {   
//         navigator.camera.getPicture(app.cameraSuccess, app.cameraError, {
//             quality: 70,
//             sourceType: Camera.PictureSourceType.SAVEDPHOTOALBUM,
//         });
//     },

//     pagesActions: {
//         "printer": function() {
//             if (app.printerManager.printerConnected()) {
//                 printerPageManage.hidden = false;
//                 printerPageScan.hidden = true;
//             } else {
//                 printerPageManage.hidden = true;
//                 printerPageScan.hidden = false;
//                 app.printersScanStart();
//             }
//         }
//     },

//     go: function(e) {   
//         app.checkPrinterConnection();
//         var pgname = null;
//         if (typeof e === 'string') {
//             pgname = e;
//         } else {
//             var target = $(e.target); 
//             if (!target.attr('data-page')) target = target.closest('[data-page]');
//             pgname = target.data('page');
//         }
//         $('.page').addClass('d-none');
//         $('#page-' + pgname).removeClass('d-none');
//         // Execute custom actions
//         if (app.pagesActions.hasOwnProperty(pgname)) app.pagesActions[pgname]();
//     },


//     printersScanStart: function() {
//         buttonRefreshPrinterList.hidden = true;
//         spinnerRefreshPrinterList.hidden = false;
//         $('#printerList').empty();

//         var onComplete = function() {
//             buttonRefreshPrinterList.hidden = false;
//             spinnerRefreshPrinterList.hidden = true;
//         };

//         app.printerManager.scan(
//             function(printer) {
//                 var badge = $('<span>').addClass("badge badge-primary badge-pill p-2").html(printer.id);
//                 $('<li>').addClass('list-group-item')
//                     .addClass('list-option-printer')
//                     .addClass('d-flex')
//                     .addClass('justify-content-between')
//                     .addClass('align-items-center')
//                     .html(printer.name)
//                     .append(badge)
//                     .on('click', function() { 
//                         buttonRefreshPrinterList.hidden = true;
//                         spinnerRefreshPrinterList.hidden = true;
//                         $('.list-option-printer').unbind( "click" );
//                         $(this).html('<i class="fas fa-circle-notch fa-spin"></i> Connecting...').addClass('active').removeClass('justify-content-between').removeClass('d-flex');
//                         app.printerManager.connectTo(printer, app.printerNowConnected, app.printerConnectionFailed); 
//                     })
//                     .appendTo('#printerList');
//             }, 
//             function(msg) {
//                 app.quickAlert("Error", msg);
//                 onComplete();
//             },
//             onComplete);
//     },

//     printerNowConnected: function() {
//         // navigator.notification.alert("Printer connected");
//         $('#printerConfig').html('Loading...');
//         app.printerManager.getPrinter().requestConfig(function(success, info) {
//             if (success) $('#printerConfig').html('Fetching...');
//             else $('#printerConfig').html('Error: '+info);
//         });
//         app.go("printer");
//     },

//     printerConnectionFailed: function() {
//         app.quickAlert("Error", "Connection to printer failed to selected printer");
//         app.go("printer");
//     },

//     disconnectPrinter: function() {
//         app.printerManager.disconnectPrinter(function(success) {
//             if (success) {
                
//                 app.quickAlert("Disconnected", "The printer has been successfully disconnected");
//                 $('#printerConfig').html('Loading...');
//                 app.go("printer");
//             } else {
//                 $('#printerConfig').html('An error occurred');
//                 app.quickAlert("Error", "Disconnection failed, please try again");
//             }
//         });
//     },

//     checkPrinterConnection: function() {
//         if (app.printerManager.printerConnected()) {
//             $('.needs-connection').prop('disabled', false);
//             $('.no-connection-msg').addClass('d-none');
//             $('#btn-connect span').html(" Manage");
//             $('#btn-connect').removeClass('btn-outline-danger');
//             $('#btn-connect').removeClass('pulse-border');
//             $('#btn-connect').addClass('btn-outline-success');
//         } else {
//             $('.needs-connection').prop('disabled', true);
//             $('.no-connection-msg').removeClass('d-none');
//             $('#btn-connect span').html(" Connect");
//             $('#btn-connect').removeClass('btn-outline-success');
//             $('#btn-connect').addClass('pulse-border');
//             $('#btn-connect').addClass('btn-outline-danger');
//         }
        
//     }
// };

// app.initialize();