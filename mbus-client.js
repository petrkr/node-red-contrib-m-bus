
module.exports = function (RED) {
  'use strict'

  function MbusClientNode (config) {
    RED.nodes.createNode(this, config)

    let MbusMaster = require('node-mbus')

    this.clienttype = config.clienttype
    this.tcpHost = config.tcpHost
    this.tcpPort = parseInt(config.tcpPort) || 500

    this.serialPort = config.serialPort
    this.serialBaudrate = config.serialBaudrate

    this.autoConnect = !!config.autoConnect

    let node = this

    node.client = null
    node.devices = {}
    node.reconnectTimeout = null

    node.onConnect = function(err){
      if(err){
        node.emit('mberror', err.message);
        node.error('Error while connecting', err.message);
        node.restartConnection()
      }
      else{
        node.emit('mbscan');
        node.warn('Connected, scanning started...');

        // node.client.getData(1, function(err, data){
        //   if (err) {
        //       node.emit('mberror', err.message);
        //   }else{
        //     node.emit('mbdeviceUpdated', data);
        //   }
        // })

        node.client.scanSecondary(function(err, data) {
          if(err){
           node.emit('mberror', err.message);
           node.error('Error while scanning', err.message);
           node.restartConnection()
          }
          else{
            node.devices = data;
            node.errors = {};
            node.data = {};
            node.lastUpdated = 0;
            node.emit('mbscanComplete', data);
            updateDevices();
          }
        });
      }
    }

    function updateDevices(){
      if(!node.devices || node.devices.length == 0)
      {
        node.emit('mberror', "No devices found update");
        node.error('No devices to update');
        return;
      }

      if(node.lastUpdated >= node.devices.length)
        node.lastUpdated = 0;

      var addr = node.devices[node.lastUpdated];

      node.client.getData(addr, function(err, data){
        if (err) {
            node.emit('mberror', err.message);
            node.errors[addr] = true;
            node.error('Error while reading device', addr);
            //adapter.log.error('M-Bus Devices ' + Object.keys(errorDevices).length + ' errored from ' + Object.keys(mBusDevices).length);
            if (Object.keys(node.errors).length === node.devices.length) {
                node.restartConnection()
            }
        }else{
          node.lastUpdated++;
          node.data[addr] = data;
          node.emit('mbdeviceUpdated', data);
          updateDevices();
        }
      })
    }

    node.restartConnection = function(err){

      node.emit('mbreconnect')
      node.warn('Restarting client')

      node.reconnectTimeout = setTimeout(function(){
      if(node.client){
        node.client.close(function(err){
          if(err) node.error("Error while closing connection", err.message);
          node.connect(node.onConnect);
        })
      }else
        node.connect(node.onConnect);
      }, 5000);
    }

    node.connect = function(cb){

      node.warn('Opening connection...')

      var mbusOptions = {autoConenct: this.autoConenct};

      if (node.clienttype === 'tcp') {
        mbusOptions.host = this.tcpHost;
        mbusOptions.port = this.tcpPort;
      }else {
        mbusOptions.serialPort = this.serialPort;
        mbusOptions.serialBaudrate = this.serialBaudrate;
      }

      node.client = new MbusMaster(mbusOptions);
      node.client.connect(cb);
    }

    node.on('close', function (done) {
      node.devices = {};
      node.errors = {};
      node.data = {};
      node.lastUpdated = 0;

      if(node.reconnectTimeout){
        clearTimeout(node.reconnectTimeout);
        node.reconnectTimeout = null;
      }

      if (node.client) {
        node.client.close(function (err) {
          if(err) node.error("Error while closing client: "+err.message)
          else node.warn('Connection closed')
          node.emit('mbclosed');
          done()
        });
      }else
        node.emit('mbclosed');
        done()
    });

    //start connection
    node.connect(node.onConnect);
  }

  RED.nodes.registerType('mbus-client', MbusClientNode)

  RED.httpAdmin.get('/mbus/serial/ports', RED.auth.needsPermission('serial.read'), function (req, res) {
    let SerialPort = require('serialport')
    SerialPort.list(function (err, ports) {
      if (err) console.log(err)
      res.json(ports)
    })
  })
}