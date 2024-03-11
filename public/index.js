const createRecvTransportBtn = document.getElementById("btnRecvSendTransport");
const remotevideo = document.getElementById("RVideo");
const Videocontainer = document.getElementById('videoContainer')
const io = require("socket.io-client");
const client = require("mediasoup-client");
const socket = io();
socket.on("cunnection-suces", (socket, existedproducer) => {
  console.log(socket, existedproducer);
  getlocalstream();
});

//gettinglocal video
let roomName = window.location.pathname.split("/")[2]
let device;
let rtpCapabilities;
let producerTransport;
let producer;
let consumerTransport = [];
let consumer;
let isProducer = false;
let params = {
  encoding: [
    {
      rid: "r0",
      maxBitrate: 100000,
      scalabitilyMode: "S1T3",
    },
    {
      rid: "r1",
      maxBitrate: 300000,
      scalabitilyMode: "S1T3",
    },
    {
      rid: "r2",
      maxBitrate: 900000,
      scalabitilyMode: "S1T3",
    },
  ],
  codecOptions: {
    videoGoogleStartBitrate: 1000,
  },
};
let getlocalstream = () => {
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(function (stream) {
        var videoElement = document.getElementById("localVideo");
        videoElement.srcObject = stream;
        let track = stream.getVideoTracks()[0];
        params = {
          track,
          ...params,
        };
        videoElement.play();
        joinRoom();
      })
      .catch(function (error) {
        console.error("Error accessing the camera: ", error);
      });
  } else {
    console.error("getUserMedia is not supported in this browser");
  }
};
//
const joinRoom = () => {
 console.log(" ff")
  socket.emit("joinRoom", { roomName }, (data) => {
    console.log("router rtpCapabilities", data.rtpCapabilities)
    rtpCapabilities = data.rtpCapabilities;
    createDevice()
  })
}
//
// const goConsume = () => {
//   goconnet(false);
// };
// const goconnet = (producerorconsumer) => {
//   isProducer = producerorconsumer;
//   device === undefined
//     ? getRtpCapabilities()
//     : isProducer
//       ? creatSendTransport()
//       : createRecvTransport();
// };
//
const getRtpCapabilities = () => {
  socket.emit("creatRoom", (data) => {
    if (data && data.rtpCapabilities) {
      console.log("Router RTP capabilities ", data.rtpCapabilities);
      rtpCapabilities = data.rtpCapabilities;
      // createDevice();
    } else {
      console.error("Invalid or missing RTP capabilities data");
    }
  });
};
// getrtpcapabilitiesbtn.addEventListener("click",getRtpCapabilities);

const createDevice = async () => {
  try {
    if (!rtpCapabilities) {
      console.error("RTP capabilities not available");
      return;
    }

    device = new client.Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities });
    console.log("RTP capabilities of device", device.rtpCapabilities);
    creatSendTransport();
  } catch (error) {
    console.error(error);
    if (error.name === "UnsupportedError") {
      console.log("Device is not supported");
    }
  }
};

// creatdevicebtn.addEventListener('click', createDevice);
socket.on('new-producer', ({ producerId }) => {
  signalNewconsumerTransport(producerId)
})
const getProducers = () => {
  socket.emit("getProducers", (producerIds) => {
    console.log(producerIds)
    producerIds.forEach(signalNewconsumerTransport)
  })
}
const creatSendTransport = async () => {
  socket.emit("creatWebrtcTransport", { consumer: false }, ({ params }) => {
    console.log(` params from server ${params}`);
    if (params.error) {
      console.log(params.error);
      return;
    }
    producerTransport = device.createSendTransport(params);
    producerTransport.on(
      "connect",
      async ({ dtlsParameters }, callback, errorback) => {
        try {
          console.log(dtlsParameters);
          await socket.emit("transport-connect", {
            // transportId:producerTransport.id,
            dtlsParameters: dtlsParameters,
          });
          callback();
        } catch (error) {
          errorback(error);
        }
      }
    );
    producerTransport.on("produce", async (parameters, callback, errorback) => {
      try {
        console.log(parameters);
        await socket.emit(
          "transport-produce",
          {
            // transportId:producerTransport.id,
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            appData: parameters.appData,
          },
          ({ id, producerExist }) => {
            console.log(id,producerExist)
            callback({ id });
            if (producerExist) getProducers()
          }
        );
      } catch (error) {
        errorback(error);
      }
    });
    connetsendTransport();
  });
};
const connetsendTransport = async () => {
  console.log("these are the " ,params)
  producer = await producerTransport.produce(params);
  producer.on("trackended", () => {
    console.log("track ended");
  });
  producer.on("transportclose", () => {
    console.log("transport close");
  });
};
const signalNewconsumerTransport = async (remoteProducerId) => {
  await socket.emit("creatWebrtcTransport", { consumer: true }, ({ params }) => {
    if (params.error) {
      console.log(params.error);
      return;
    }
    console.log(params);
    consumerTransport = device.createRecvTransport(params);
    consumerTransport.on(
      "connect",
      async ({ dtlsParameters }, callback, errorback) => {
        try {
          await socket.emit("transport-recv-connet", {
            dtlsParameters,
            serverConsumerId:params.id
          });
          callback();
        } catch (error) {
          errorback(error);
        }
      }
    );
    connectRecTransport(consumerTransport, remoteProducerId, params.id);
  });
};
let consumerTransports = [ ]
const connectRecTransport = async (consumerTransport, remoteProducerId, serverConsumerId) => {
  await socket.emit(
    "consume",
    {
      rtpCapabilities: device.rtpCapabilities,
      remoteProducerId,
      serverConsumerId
    },
    async ({ params }) => {
      if (params.error) {
        console.log("can not able to consume");
        return;
      }
      console.log(params);
      const consumer = await consumerTransport.consume({
        id: params.id,
        producerId: params.producerId,
        kind: params.kind,
        rtpParameters: params.rtpParameters,
      });
      consumerTransports = [
        ...consumerTransports,
        {
          consumerTransport,
          serverConsumerId: params.id,
          producerId: remoteProducerId,
          consumer
        }
      ]
      let newElem = document.createElement('div')
      newElem.setAttribute("id", `td-${remoteProducerId}`)
      newElem.setAttribute("class", `remoteVideo`)
      newElem.innerHTML = '<video id="' + remoteProducerId + '" autoplay class="video" ></video>'
      let { track } = consumer;
      console.log(track)
      // console.log(remotevideo);
      Videocontainer.appendChild(newElem)
      socket.emit("consumer-resum", { serverConsumerId: params.serverConsumerId });
      console.log(document.getElementById(remoteProducerId))
      document.getElementById(remoteProducerId).srcObject = new MediaStream([track])
    }
  );
};

socket.on("producer-close", ({ remoteProducerId }) => {
  const producerToClose = consumerTransports.find(transPortdata => transPortdata.producerId === remoteProducerId)
  producerToClose.consumerTransport.close();
  producerToClose.consumer.close()
  consumerTransports = consumerTransports.filter(transportData => transportData.producerId !== remoteProducerId)

  // remove the video div element
  Videocontainer.removeChild(document.getElementById(`td-${remoteProducerId}`))
})
// creatsendtransportbtn.addEventListener("click", creatSendTransport)
// sendconnecttransportbtn.addEventListener("click", connetsendTransport)
// createRecvTransportBtn.addEventListener("click", goConsume);
// connectsendrectransportbtn.addEventListener('click',connectRecTransport)
