class PrintManager {
    
    constructor() {
        this._printer = null;
        this._bleAvailable = false;
        this._scanTimeout = null;
        this.isScanning = false;
        this.listeners = new Map();
    }

    addListener(label, callback) {
        this.listeners.has(label) || this.listeners.set(label, []);
        this.listeners.get(label).push(callback);
    }

    isFunction(obj) {  
        return typeof obj == 'function' || false;
    }
    
    removeListener(label, callback) {  
        let listeners = this.listeners.get(label), index;
    
        if (listeners && listeners.length) {
            index = listeners.reduce((i, listener, index) => {
                return (this.isFunction(listener) && listener === callback) ?
                    i = index :
                    i;
            }, -1);
    
            if (index > -1) {
                listeners.splice(index, 1);
                this.listeners.set(label, listeners);
                return true;
            }
        }
        return false;
    }

    emitEvent(label, json) {  
        let listeners = this.listeners.get(label);
        if (listeners && listeners.length) {
            listeners.forEach((listener) => {
                listener(json); 
            });
            return true;
        }
        return false;
    }

    _processUpdates(updJson) {
        console.log(JSON.stringify(updJson, undefined, 2));
        // Create event
        this.emitEvent(updJson.type, updJson);
    }
    
    isRadioEnabled(cb=null) {
        try {
            ble.isEnabled(
            function() {
                this._bleAvailable = true;
                if (cb!==null) cb(true);
            }.bind(this), 
            function() {
                this._bleAvailable = false;
                if (cb!==null) cb(false);
            }.bind(this));
        } catch (e) {
            if (cb!==null) cb(false);
        }
    }

    printerConnected() {
        return this._printer !== null;
    }

    getPrinter() {
        if (!this.printerConnected()) return null;
        return this._printer;
    }

    scan(cbEachDeviceFound=null, cbError=null, cdComplete=null, scanFor=5000) {
        this.isRadioEnabled(function(available) {
            if (available) {
                this.startScan(cbEachDeviceFound, cbError, cdComplete, scanFor);
            } else {
                cbError("Bluetooth is not available. Without it no remote printers can be scanned for. Please make sure it is enabled in you device's settings.");
            }
        }.bind(this))
    }

    startScan(cbEachDeviceFound, cbError, cdComplete, scanFor) {
        this.isScanning = true;
        ble.startScan([], function(device) { 
            console.log(JSON.stringify(device));
            var p = new Printer(device.id, device.name, device.advertising, device.rssi, this)
            if (cbEachDeviceFound !== null) cbEachDeviceFound(p);
        }.bind(this), function() { 
            this.isScanning = false;
            if (cbError !== null) cbError("Scan failed to start");
            if (cdComplete !== null) cdComplete();
        }.bind(this));

        // Stop after timeout
        this._scanTimeout = setTimeout(ble.stopScan,
            scanFor,
            function() {
                this.isScanning = false;
                if (cdComplete !== null) cdComplete();
            }.bind(this),
            function() { 
                this.isScanning = false;
                if (cbError !== null) cbError("Failed to terminate scan");
            }.bind(this)
        );
    }

    connectTo(printer, cbConnect=null, cbDisconnect=null) {
        if (this._scanTimeout !== null) clearTimeout(this._scanTimeout);
        this.isScanning = false;
        ble.stopScan();
        printer.connect(
            function() { 
                // Connection established
                this._printer = printer;
                if (cbConnect !== null) cbConnect();
            }.bind(this),
            function() { 
                // Connection fails to establish or subsequently fails
                this._printer = null;
                if (cbDisconnect !== null) cbDisconnect();
            }.bind(this),
        );
    }

    disconnectPrinter(cb=null) {
        this._printer.disconnect(function() {
            this._printer = null;
            if (cb !== null) cb(true);
        }.bind(this));
    }
}

// ------

var bluefruit = {
    serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    txCharacteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // transmit is from the phone's perspective
    rxCharacteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e'  // receive is from the phone's perspective
};






class Printer {

    constructor(id, name, advertising, rssi, manager) {
        this.id = id;
        this.name = (name === undefined || name === null) ? "No name" : name;
        this.rssi = rssi;
        this.isConnected = false;
        this.isConnecting = false;
        this.data = "";
        this.writeMethod = ble.write;
        this.printManager = manager;
    }

    _determineWriteType(peripheral) {
        var characteristic = peripheral.characteristics.filter(function(element) {
            if (element.characteristic.toLowerCase() === bluefruit.txCharacteristic) {
                return element;
            }
        })[0];
        this.writeMethod = (characteristic.properties.indexOf('WriteWithoutResponse') > -1) ? ble.writeWithoutResponse : ble.write;
    }

    connect(cbConnect=null, cbDisconnect=null) {
        this.isConnected = false;
        this.isConnecting = true;
        var onConnect = function(peripheral) {
            this.isConnecting = false;
            try {
                this._determineWriteType(peripheral);
                ble.startNotification(this.id, bluefruit.serviceUUID, bluefruit.rxCharacteristic, this._onData.bind(this), this._onConnectionError.bind(this));
                this.isConnected = true;

                // Get the config details
                this.requestConfig(function() { 
                    if (cbConnect!==null) cbConnect();
                }.bind(this));

            } catch (error) {
                console.log(error);
                this._onConnectionError("Failed to connect.");
                if (cbDisconnect!==null) cbDisconnect();
            } 
        }.bind(this);
        var onDisconnect = function() {
            this._onConnectionError("Lost connection to device.");
            this.isConnected = false;
            this.isConnecting = false;
            if (cbDisconnect!==null) cbDisconnect();
        }.bind(this)
        ble.connect(this.id, onConnect, onDisconnect);
    }

    _onData(data) {
        // Append data and remove all newlines, tabs, etc.
        this.data += this.bytesToString(data).replace(/(\r\n\t|\n|\r\t)/gm,"");
        var num_open_braces = (this.data.match(/{/g) || []).length;
        var num_close_braces = (this.data.match(/}/g) || []).length;
        // If the string is a complete json sting i.e. num of { == num of }
        if (num_open_braces === num_close_braces) {
            try {
                console.log(this.data);
                var json = JSON.parse(this.data);
                this.printManager._processUpdates(json);
            } catch(e) {
                console.log("Parse error", e);
            } finally {
                this.data = "";
            }
        } else {
            console.log("incomplete packet");
        }
    }

    _onConnectionError(msg) {
        this.isConnected = false;
    }

    disconnect(cb=null) {
        ble.disconnect(
            this.id, 
            function() {
                this.isConnected = false;
                if (cb!==null) cb(true);
            }.bind(this), 
            function() {
                if (cb!==null) cb(false);
            }.bind(this));
    }

    // Request the printer configuration
    requestConfig(cb=null) {
        this.sendCommand("getconfig");
        if (cb!==null) cb();
    }

    sendCommand(command, cb=null) {
        var cmd = JSON.stringify({"type": command});
        console.log("sending command: ", cmd, " to: ", this.id);
        ble.write(
            this.id,
            bluefruit.serviceUUID,
            bluefruit.txCharacteristic,
            this.stringToBytes(cmd),
            function(e) { console.log("ACK"); if (cb!==null) cb(true, e); },
            function(e) { console.log("No ACK"); if (cb!==null) cb(false, e); }          
        );
    }

    // ASCII only
    bytesToString(buffer) {
        return String.fromCharCode.apply(null, new Uint8Array(buffer));
    }

    // ASCII only
    stringToBytes(string) {
        var array = new Uint8Array(string.length);
        for (var i = 0, l = string.length; i < l; i++) {
            array[i] = string.charCodeAt(i);
        }
        return array.buffer;
    }

}