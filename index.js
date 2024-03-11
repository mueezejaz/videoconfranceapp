import express from "express";
import mediasoup from "mediasoup"; // Import mediasoup
import { Console } from "node:console";
import { promises } from "node:dns";
import http from "node:http"; // Change this import
import path from "path"; // Change this import
import { Server } from "socket.io";
const app = express();
const server = http.createServer(app); // Use http.createServer instead of createServer
const io = new Server(server);
const __dirname = path.resolve();
app.use("/sfu/:room", express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => {
  res.json({
    data: "server express orr and is running in docker",
  });
});

// creating worker
// mediacodecs
const mediaCodecs = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/H264",
    clockRate: 90000,
    parameters: {
      "packetization-mode": 1,
      "profile-level-id": "42e01f",
      "level-asymmetry-allowed": 1,
    },
  },
];
let worker;
let rooms = {};
let peers = {};
let transports = [];
let producers = [];
let consumers = [];
const creatworker = async () => {
  console.log(mediasoup.version);
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2020,
  });
  console.log(`worker pid = ${worker.pid}`);
  worker.on("died", (error) => {
    console.log(`worker has dies ${error}`);
    setTimeout(() => {
      process.exit(1);
    }, 2000);
  });
  return worker;
};
// Corrected the async call here
creatworker()
  .then((createdWorker) => {
    worker = createdWorker;
  })
  .catch((error) => {
    console.error("Error creating worker:", error);
    process.exit(1); // Exit the process if worker creation fails
  });
const CreateWebRtcTransportRequest = async (router) => {
  return new Promise(async (resolve, reject) => {
    try {
      const webRtctranport_options = {
        listenIps: [
          {
            ip: "127.0.0.1",
          },
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      };
      const transport = await router.createWebRtcTransport(
        webRtctranport_options
      );
      console.log("transport is is ", transport.id);
      transport.on("dtlsStateChanged", (e) => {
        if (e === "closed") {
          transport.close();
        }
      });
      transport.on("close", () => {
        console.log("Transport closed");
      });
      resolve(transport);
    } catch (error) {
      reject(error);
    }
  });
};
io.on("connection", async (socket) => {
  console.log("a user connected ", socket.id);
  socket.emit("cunnection-suces", {
    socketid: socket.id,
  });
  const removeItems = (items, socketId, type) => {
    items.forEach(item => {
      if (item.socketid === socket.id) {
        item[type].close()
      }
    })
    items = items.filter(item => item.socketid !== socket.id)

    return items
  }
  socket.on("disconnect", () => {
    console.log("user is disconnected");
    consumers = removeItems(consumers, socket.id, 'consumer')
    producers = removeItems(producers, socket.id, 'producer')
    transports = removeItems(transports, socket.id, 'transport')

    const roomName  = peers[socket.id].roomName
    delete peers[socket.id]

    // remove socket from room
    rooms[roomName] = {
      router: rooms[roomName].router,
      peers: rooms[roomName].peers.filter(socketid => socketid !== socket.id)
    }
  });
  socket.on("joinRoom", async ({ roomName }, callback) => {
    const router1 = await createRoom(roomName, socket.id);
    peers[socket.id] = {
      socket,
      roomName,
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: " ",
        isadmin: false,
      },
    };
    // console.log(rooms , peers)
    const rtpCapabilities = router1.rtpCapabilities;
    callback({ rtpCapabilities });
  });
  const createRoom = async (roomName, socketid) => {
    let router1;
    let peers = [];
    if (rooms[roomName]) {
      router1 = rooms[roomName].router;
      peers = rooms[roomName].peers || [];
    } else {
      router1 = await worker.createRouter({ mediaCodecs });
    }
    // console.log(`Router is is ${router1.id} and its peers are ${peers.length}`);
    rooms[roomName] = {
      router: router1,
      peers: [...peers, socketid],
    };
    return router1;
  };
  const addTransport = (transport, roomName, consumer)=>{
    transports = [
        ...transports,
        {socketid:socket.id,transport,roomName,consumer}
    ],
    peers[socket.id] ={
        ...peers[socket.id],
        transports:[
            ...peers[socket.id].transports,
            transport.id
        ]
    }
    // console.log(transports,peers)
  }
  const addConsumer = (consumer,roomName)=>{
    consumers = [
      ...consumers,
      {socketid:socket.id,roomName,consumer}
  ]
  peers[socket.id] ={
    ...peers[socket.id],
    transports:[
        ...peers[socket.id].consumers,
        consumer.id
    ]
}
  }
  socket.on("creatWebrtcTransport", async ({ consumer }, callback) => {
    const roomName = peers[socket.id].roomName;
    const router = rooms[roomName].router;
    // console.log(router)
    // console.log(`this is ${sender} request`);
    CreateWebRtcTransportRequest(router).then(
      (transport) => {
        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });
        addTransport(transport, roomName, consumer);
      },
      (err) => console.log(err)
    );
  });
  const getTransport = (socketid)=>{
      const [producerTransport] =  transports.filter(trasport => trasport.socketid === socketid && !trasport.consumer)
    return producerTransport.transport
    }
  socket.on("transport-connect", async ({ dtlsParameters }) => {
    console.log("DTLS params ...", dtlsParameters);
    await getTransport(socket.id).connect({ dtlsParameters });
  });
  const addProducer = (roomName,producer)=>{
    producers = [
        ...producers,
        {socketid:socket.id,producer,roomName}
    ];
    peers[socket.id] = {
        ...peers[socket.id],
        producers:[
        ...peers[socket.id].producers,
        producer.id
       ]
    }
  }
  socket.on("getProducers",(callback)=>{
    const roomName = peers[socket.id].roomName;
    let producerslist = [];
    producers.forEach((producer)=>{
      if(producer.socketid!==socket.id && producer.roomName===roomName){
        producerslist = [...producerslist,producer.producer.id]
      }
    }) 
    callback(producerslist)
  })
  const informConsumers = (roomName,socketid,id)=>{
    console.log(`A new user conneted to room ${roomName} , ${socketid}`)
    producers.forEach(producerData => {
      if (producerData.socketid !== socketid && producerData.roomName === roomName) {
        const producerSocket = peers[producerData.socketid].socket
        // use socket to send producer id to producer
        producerSocket.emit('new-producer', { producerId: id })
      }})
  }
  socket.on(
    "transport-produce",
    async ({ kind, rtpParameters, appData }, callback) => {
      const producer = await getTransport(socket.id).produce({
        kind,
        rtpParameters,
      });
      const roomName = peers[socket.id].roomName;
      addProducer(roomName,producer)
      informConsumers(roomName,socket.id,producer.id)
      console.log("prodicer is and producer kind ", producer.id, producer.kind);
      producer.on("transportclose", () => {
        console.log("transport is closed for this producer");
        producer.close();
      });
      callback({ id: producer.id,producerExist:producers.length>1?true:false });
    }
  );
  socket.on("transport-recv-connet", async ({ dtlsParameters,serverConsumerId }) => {
    const consumerTransport = transports.find(data => {
      return data.consumer && data.transport.id === serverConsumerId;
  });
    await consumerTransport.transport.connect({ dtlsParameters });
  });
  socket.on("consume", async ({ rtpCapabilities,remoteProducerId,serverConsumerId }, callback) => {
    try {
      console.log("conn1");
    const roomName = peers[socket.id].roomName;
    const router = rooms[roomName].router;
  //   transports = [
  //     ...transports,
  //     {socketid:socket.id,transport,roomName,consumer}
  // ],
  console.log(transports,serverConsumerId)
  const consumerTransport = transports.find(transportData => {
    return transportData.transport.id === serverConsumerId && transportData.consumer;
});
    console.log("consumer found",consumerTransport.transport)
      // if (router.canConsume({
      //     producerId: producer.Id,
      //     rtpCapabilities
      // })) {
      //     console.log("conn")
      let consumer = await consumerTransport.transport.consume({
        producerId: remoteProducerId,
        rtpCapabilities,
        paused: true,
      });
      consumer.on("transportclose", () => {
        console.log("cnsumer close transport");
      });
      consumer.on("producerclose", () => {
        console.log("producer of consumer is closed");
        socket.emit("producer-close",{remoteProducerId})
        consumerTransport.close();
        transports.filter(data => { data.transport.id !== consumerTransport.id})
        consumer.close()
        consumers.filter(data => { data.consumer.id !== consumer.id})

      });
      const params = {
        id: consumer.id,
        producerId: remoteProducerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        serverConsumerId :consumer.id
      };
      addConsumer(consumer,roomName)
      callback({ params });
      // }
    } catch (error) {
      console.log(error.message);
      callback({
        params: {
          error: error,
        },
      });
    }
  });
  socket.on("consumer-resum", async  ({serverConsumerId}) => {
    const { consumer } = consumers.find(consumerData => {
      return consumerData.consumer.id === serverConsumerId;
  });

  if (consumer) {
      await consumer.resume();
  } else {
      console.error("Consumer not found.");
  }
  });
});
server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});
