//FIXME - showModal 메서드로 만들기
//FIXME - 각 역할의 플레이어 유저 아이디 반환 메서드 만들기
//FIXME - 라운드명 상수화
//FIXME - 5명보다 많은 인원 수도 테스트 (특히, r0-2)
//FIXME - 게임 오버 뒤 라운드 1개 더 진행되는 현상 수정
//FIXME - 관전자는 게임 흐름따라가도록 수정 (캠, 마이크)
//FIXME - r2-0에서 playError에서 error 메세지 안뜸
//FIXME - 타입스크립트 변환

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import {
  createRoom,
  exitRoom,
  fastJoinRoom,
  getChief,
  getRoomInfo,
  getRooms,
  getUserCountInRoom,
  getUsersInfoInRoom,
  joinRoom,
  setRoomIsPlaying,
} from "./api/supabase/roomAPI.js";
import {
  checkAllPlayersReady,
  checkPlayerCountEnough,
  getPlayersInRoom,
  getSelectedPlayer,
  getVoteToResult,
  initGame,
  killPlayer,
  resetSelectedPlayer,
  resetVote,
  savePlayer,
  selectPlayer,
  setPlayerRole,
  setReady,
  voteTo,
  voteYesOrNo,
} from "./api/supabase/gamePlayAPI.js";
import {
  gameOver,
  getMostVotedPlayer,
  getRoleMaxCount,
  getYesOrNoVoteResult,
  playError,
  shufflePlayers,
} from "./api/socket/moderatorAPI.js";

const app = express();
const httpServer = createServer(app);
const port = 4000;
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    origin: "*",
  },
});
const mafiaIo = io.of("/mafia");

app.get("/", (req, res) => {
  res.send("express 서버와 연결되어 있습니다.");
});

mafiaIo.on("connection", (socket) => {
  socket.join("0ed9a099-f1b4-46eb-a187-2da752eed29c"); //NOTE - 테스트용 코드
  socket.join("11111111-f1b4-46eb-a187-2da752eed29c"); //NOTE - 테스트용 코드
  socket.data.userId = "11111111-f1b4-46eb-a187-2da752eed29c"; //NOTE - 테스트용 코드
  socket.data.roomId = "0ed9a099-f1b4-46eb-a187-2da752eed29c"; //NOTE - 테스트용 코드
  //NOTE - joinRoom하고 fastJoinRoom에서 처리하고 있음

  socket.on("enterMafia", async () => {
    console.log("[enterMafia]");

    try {
      const rooms = await getRooms();
      socket.emit("enterMafia", rooms);
    } catch (error) {
      console.log(`[enterMafiaError] ${error.message}`);
      socket.emit("enterMafiaError", error.message);
    }
  });

  socket.on("createRoom", async (title, game_category, total_user_count) => {
    console.log(
      `[createRoom] title : ${title}, game_category : ${game_category}, total_user_count : ${total_user_count}`
    );

    try {
      const room = await createRoom(title, game_category, total_user_count);
      socket.emit("createRoom", room);
    } catch (error) {
      console.log(`[createRoomError] ${error.message}`);
      socket.emit("createRoomError", error.message);
    }
  });

  socket.on("joinRoom", async (userId, roomId, nickname) => {
    console.log(
      `[joinRoom] userId : ${userId}, roomId : ${roomId}, nickname : ${nickname}`
    );

    try {
      await joinRoom(roomId, userId, nickname);
      const usersInfo = await getUsersInfoInRoom(roomId);
      const roomInfo = await getRoomInfo(roomId);

      socket.join(roomId);
      socket.join(userId);
      socket.data.userId = userId;
      socket.data.roomId = roomId;

      mafiaIo.to(roomId).emit("joinRoom", usersInfo, roomId);
      mafiaIo.emit("updateRoomInfo", roomInfo);
    } catch (error) {
      console.log(`[joinRoomError] ${error.message}`);
      socket.emit("joinRoomError", error.message);
    }
  });

  socket.on("fastJoinRoom", async (userId, nickname) => {
    console.log(`[fastJoinRoom] userId : ${userId}, nickname : ${nickname}`);

    try {
      const roomId = await fastJoinRoom(userId, nickname);
      const usersInfo = await getUsersInfoInRoom(roomId);
      const roomInfo = await getRoomInfo(roomId);

      socket.join(roomId);
      socket.join(userId);
      socket.data.roomId = roomId;
      socket.data.userId = userId;

      mafiaIo.to(roomId).emit("fastJoinRoom", usersInfo, roomId);
      mafiaIo.emit("updateRoomInfo", roomInfo);
    } catch (error) {
      console.log(`[fastJoinRoomError] ${error.message}`);
      socket.emit("fastJoinRoomError", error.message);
    }
  });

  socket.on("exitRoom", async (roomId, userId) => {
    console.log(`[exitRoom] roomId : ${roomId}, userId : ${userId}`);

    try {
      await exitRoom(roomId, userId);
      const usersInfo = await getUsersInfoInRoom(roomId);
      const roomInfo = await getRoomInfo(roomId);

      socket.data.userId = null;
      socket.data.roomId = null;
      socket.leave(userId);
      socket.leave(roomId);

      mafiaIo.to(roomId).emit("exitRoom", usersInfo);
      mafiaIo.emit("updateRoomInfo", roomInfo);
    } catch (error) {
      console.log(`[exitRoomError] ${error.message}`);
      socket.emit("exitRoomError", error.message);
    }
  });

  socket.on("setReady", async (userId, ready) => {
    console.log(`[setReady] userId : ${userId}, ready : ${ready}`);

    try {
      await setReady(userId, ready);

      const roomId = socket.data.roomId;
      mafiaIo.to(roomId).emit("setReady", userId, ready);
      canGameStart(roomId);
    } catch (error) {
      console.log(`[setReadyError] ${error.message}`);
      socket.emit("setReadyError", error.message);
    }
  });

  socket.on("usersInfo", async (roomId) => {
    try {
      const usersInfo = await getUsersInfoInRoom(roomId);
      socket.emit("usersInfo", usersInfo);
    } catch (error) {
      console.log(`[usersInfoError] ${error.message}`);
      socket.emit("usersInfoError", error.message);
    }
  });

  //FIXME - 메인 페이지에서 새로고침할 경우 대처
  socket.on("disconnect", async () => {
    console.log("클라이언트와의 연결이 끊겼습니다.");

    try {
      const roomId = socket.data.roomId;
      const userId = socket.data.userId;

      console.log(`[exitRoom] roomId : ${roomId}, userId : ${userId}`);
      await exitRoom(roomId, userId);

      const roomInfo = await getRoomInfo(roomId);
      const usersInfo = await getUsersInfoInRoom(roomId);

      socket.leave(userId);
      socket.leave(roomId);
      socket.data.userId = null;
      socket.data.roomId = null;

      mafiaIo.to(roomId).emit("exitRoom", usersInfo);
      mafiaIo.emit("updateRoomInfo", roomInfo);
    } catch (error) {
      console.log(`[exitRoomError] ${error.message}`);
      // socket.emit("exitRoomError", error.message);
    }
  });

  socket.on("gameStart", async (roomId, playersMaxCount) => {
    console.log(`[gameStart] roomId : ${roomId}, 총 인원 : ${playersMaxCount}`);
    mafiaIo.to(roomId).emit("gameStart");

    try {
      await setRoomIsPlaying(roomId, true);
      const roomInfo = await getRoomInfo(roomId);
      mafiaIo.emit("updateRoomInfo", roomInfo);
    } catch (error) {
      return await playError("start", roomId, mafiaIo, error, null);
    }

    let roundName = "init"; //FIXME - 테스트용 코드, 실제 배포시에는 init으로 변경
    let allPlayers = null;

    let mafiaMaxCount = null;
    let doctorMaxCount = null;
    let policeMaxCount = null;

    let voteBoard = null;
    let mostVoteResult = null;
    let yesOrNoVoteResult = null;

    let time = 1;

    const start = setInterval(async () => {
      time--; //FIXME - 테스트 코드, 배포할 때는 --로 고치기

      if (time <= 0) {
        try {
          allPlayers = await getPlayersInRoom(roomId);
          await gameOver(mafiaIo, roomId, roundName, allPlayers, start); //NOTE - 라운드마다 게임 종료 조건 확인
        } catch (error) {
          return await playError(roundName, roomId, mafiaIo, error, start);
        }

        if (roundName == "init") {
          try {
            await initGame(roomId);
            roundName = "r0-0";
          } catch (error) {
            console.log(`[playError] ${roundName}, ${error.message}`);
            mafiaIo.to(roomId).emit("playError", roundName, error.message);
            clearInterval(start);
          }
        }

        if (roundName === "r0-0") {
          console.log(`${roundName} 시작`);
          time = 1;

          let media = {};
          allPlayers.forEach((player) => {
            media[player.user_id] = { camera: false, mike: false };
          });

          console.log(
            `[${roundName}] playerMediaStatus : 모든 유저 카메라 마이크 끔`
          );
          console.log(media);
          mafiaIo.to(roomId).emit("playerMediaStatus", media);

          console.log(`${roundName} 종료`);
          roundName = "r0-1";
        } else if (roundName === "r0-1") {
          console.log(`${roundName} 시작`);
          time = 3;

          console.log(`[${roundName}] showModal :  밤이 되었습니다. / 3초`);
          mafiaIo.to(roomId).emit("showModal", "밤이 되었습니다.", time);

          console.log(`${roundName} 종료`);
          roundName = "r0-2";
        } else if (roundName === "r0-2") {
          console.log(`${roundName} 시작`);
          time = 10;

          let playersUserId = allPlayers.map((player) => player.user_id);
          [mafiaMaxCount, policeMaxCount, doctorMaxCount] =
            getRoleMaxCount(playersMaxCount);

          let mafiaPlayers = null;
          let doctorPlayer = null;
          let policePlayer = null;
          let citizenPlayers = null;

          playersUserId = shufflePlayers(playersUserId);

          console.log("총 플레이어", playersUserId);
          console.log("최대 마피아 인원 수", mafiaMaxCount);
          console.log("최대 의사 인원 수", doctorMaxCount);
          console.log("최대 경찰 인원 수", policeMaxCount);

          try {
            //FIXME - 테스트용 코드, 배포시 삭제
            for (
              let playerIndex = 0;
              playerIndex < playersMaxCount;
              playerIndex++
            ) {
              await setPlayerRole(playersUserId[playerIndex], "시민");
            }

            //NOTE - 마피아 인원 수만큼 플레이어들에게 마피아 역할 배정
            for (
              let playerIndex = 0;
              playerIndex < mafiaMaxCount;
              playerIndex++
            ) {
              await setPlayerRole(playersUserId[playerIndex], "마피아");
            }

            if (doctorMaxCount !== 0) {
              console.log("의사 역할 배정");
              await setPlayerRole(playersUserId[mafiaMaxCount], "의사");
            }

            if (policeMaxCount !== 0) {
              console.log("경찰 역할 배정");
              await setPlayerRole(playersUserId[mafiaMaxCount + 1], "경찰");
            }

            allPlayers = await getPlayersInRoom(roomId);
            mafiaPlayers = allPlayers
              .filter((player) => player.role == "마피아")
              .map((player) => player.user_id);
          } catch (error) {
            return await playError(roundName, roomId, mafiaIo, error, start);
          }

          if (doctorMaxCount > 0) {
            doctorPlayer = allPlayers
              .filter((player) => player.role == "의사")
              .map((player) => player.user_id);
          }

          if (policeMaxCount) {
            policePlayer = allPlayers
              .filter((player) => player.role == "경찰")
              .map((player) => player.user_id);
          }

          citizenPlayers = allPlayers
            .filter((player) => player.role == "시민")
            .map((player) => player.user_id);

          let role = {};

          role["mafia"] = mafiaPlayers;

          if (doctorPlayer) {
            role["doctor"] = doctorPlayer;
          } else {
            role["doctor"] = null;
          }

          if (policePlayer) {
            role["police"] = policePlayer;
          } else {
            role["police"] = null;
          }

          role["citizen"] = citizenPlayers;

          console.log(
            `[${roundName}] showAllPlayerRole : 플레이어들 역할 / 10초`
          );
          console.log(role);
          mafiaIo.to(roomId).emit("showAllPlayerRole", role, time);

          console.log(`${roundName} 종료`);
          roundName = "r0-3";
        } else if (roundName === "r0-3") {
          console.log(`${roundName} 시작`);
          time = 3;

          console.log(
            `[${roundName}] showModal : 마피아들은 고개를 들어 서로를 확인해주세요. / 3초`
          );
          mafiaIo
            .to(roomId)
            .emit(
              "showModal",
              "마피아들은 고개를 들어 서로를 확인해주세요.",
              time
            );

          console.log(`${roundName} 종료`);
          roundName = "r0-4";
        } else if (roundName === "r0-4") {
          console.log(`${roundName} 시작`);
          time = 1;

          let media = {};
          const mafiaPlayers = allPlayers
            .filter((player) => player.is_lived == true)
            .filter((player) => player.role == "마피아")
            .map((player) => player.user_id);

          mafiaPlayers.forEach(
            (userId) => (media[userId] = { camera: true, mike: false })
          );

          console.log(
            `[${roundName}] playerMediaStatus : 마피아 유저들 카메라 켬, 마이크 끔`
          );
          console.log(media);

          mafiaPlayers.forEach((userId) => {
            mafiaIo.to(userId).emit("playerMediaStatus", media);
          });

          console.log(`${roundName} 종료`);
          roundName = "r0-5";
        } else if (roundName == "r0-5") {
          console.log(`${roundName} 시작`);
          time = 5;

          console.log(`[${roundName}] timerStatus / 5초`);
          mafiaIo.to(roomId).emit("timerStatus", time);

          console.log(`${roundName} 종료`);
          roundName = "r0-6";
        } else if (roundName === "r0-6") {
          console.log(`${roundName} 시작`);
          time = 1;

          let media = {};
          const mafiaPlayers = allPlayers
            .filter((player) => player.is_lived == true)
            .filter((player) => player.role == "마피아")
            .map((player) => player.user_id);

          mafiaPlayers.forEach(
            (userId) => (media[userId] = { camera: false, mike: false })
          );

          console.log(
            `[${roundName}] playerMediaStatus : 마피아 유저들 카메라 끔, 마이크 끔`
          );
          console.log(media);

          mafiaPlayers.forEach((userId) => {
            mafiaIo.to(userId).emit("playerMediaStatus", media);
          });

          console.log(`${roundName} 종료`);
          roundName = "r1-0";
        } else if (roundName == "r1-0") {
          console.log(`${roundName} 시작`);
          time = 3;

          console.log(
            `[${roundName}] showModal : 아침이 되었습니다. 모든 유저는 토론을 통해 마피아를 찾아내세요. / 3초`
          );
          mafiaIo
            .to(roomId)
            .emit(
              "showModal",
              "아침이 되었습니다. 모든 유저는 토론을 통해 마피아를 찾아내세요.",
              time
            );

          console.log(`${roundName} 종료`);
          roundName = "r1-1";
        } else if (roundName == "r1-1") {
          console.log(`${roundName} 시작`);
          time = 1;

          let media = {};
          allPlayers
            .filter((player) => player.is_lived == true)
            .forEach((player) => {
              media[player.user_id] = { camera: true, mike: true };
            });

          console.log(
            `[${roundName}] playerMediaStatus : 모든 유저 카메라 켬, 마이크 켬`
          );
          console.log(media);
          mafiaIo.to(roomId).emit("playerMediaStatus", media);

          console.log(`${roundName} 종료`);
          roundName = "r1-2";
        } else if (roundName == "r1-2") {
          console.log(`${roundName} 시작`);
          time = 60;

          console.log(`[${roundName}] timerStatus / 60초`);
          mafiaIo.to(roomId).emit("timerStatus", time);

          console.log(`${roundName} 종료`);
          roundName = "r1-3";
        } else if (roundName == "r1-3") {
          console.log(`${roundName} 시작`);
          time = 1;

          let media = {};
          allPlayers
            .filter((player) => player.is_lived == true)
            .forEach((player) => {
              media[player.user_id] = { camera: true, mike: false };
            });

          console.log(
            `[${roundName}] playerMediaStatus : 모든 유저 카메라 켬, 마이크 끔`
          );
          console.log(media);
          mafiaIo.to(roomId).emit("playerMediaStatus", media);

          console.log(`${roundName} 종료`);
          roundName = "r1-4";
        } else if (roundName == "r1-4") {
          console.log(`${roundName} 시작`);
          time = 3;

          console.log(
            `[${roundName}] showModal : 토론이 끝났습니다. 마피아일 것 같은 사람의 화면을 클릭하세요. / 3초`
          );
          mafiaIo
            .to(roomId)
            .emit(
              "showModal",
              "토론이 끝났습니다. 마피아일 것 같은 사람의 화면을 클릭하세요.",
              time
            );

          console.log(`${roundName} 종료`);
          roundName = "r1-5";
        } else if (roundName == "r1-5") {
          console.log(`${roundName} 시작`);
          time = 10;

          console.log(`[${roundName}] inSelect : vote /  10초`);
          mafiaIo.to(roomId).emit("inSelect", "vote", time);

          console.log(`${roundName} 종료`);
          roundName = "r1-6";
        } else if (roundName == "r1-6") {
          console.log(`${roundName} 시작`);
          time = 5;
          try {
            voteBoard = await getVoteToResult(roomId); //NOTE - 투표 결과 확인 (누가 얼마나 투표를 받았는지)
            voteBoard.forEach((vote) => {
              delete vote.role;
              delete vote.is_lived;
            });
            await resetVote(roomId); //NOTE - 플레이어들이 한 투표 기록 리셋, 테스트용으로 잠시 주석처리
          } catch (error) {
            return await playError(roundName, roomId, mafiaIo, error, start);
          }

          console.log(
            `[${roundName}] showVoteResult : 마피아 의심 투표 결과 / 5초`
          );
          console.log(voteBoard);
          mafiaIo.to(roomId).emit("showVoteResult", voteBoard, time);

          console.log(`${roundName} 종료`);
          roundName = "r1-7";
        } else if (roundName == "r1-7") {
          console.log(`${roundName} 시작`);
          time = 3;

          mostVoteResult = getMostVotedPlayer(voteBoard, false); //NOTE - 투표를 가장 많이 받은 사람 결과 (확정X, 동률일 가능성 존재)

          if (mostVoteResult.isValid) {
            console.log(
              `[${roundName}] showModal : ${mostVoteResult.result.user_nickname}님은 최후의 변론을 시작하세요. / 3초`
            );
            mafiaIo
              .to(roomId)
              .emit(
                "showModal",
                `${mostVoteResult.result.user_nickname}님은 최후의 변론을 시작하세요.`,
                time
              );

            console.log(`${roundName} 종료`);
            roundName = "r1-8";
          } else {
            console.log(
              `[${roundName}] showModal : 동률로 인해 임의의 플레이어가 사망합니다. ${mostVoteResult.result.user_nickname} / 3초`
            );
            mafiaIo
              .to(roomId)
              .emit(
                "showModal",
                "동률로 인해 임의의 플레이어가 사망합니다.",
                time
              );
            yesOrNoVoteResult = { result: true };
            console.log(`${roundName} 종료`);
            roundName = "r1-13";
          }
        } else if (roundName == "r1-8") {
          console.log(`${roundName} 시작`);
          time = 1;

          let media = {};
          allPlayers
            .filter(
              (player) => player.user_id === mostVoteResult.result.user_id
            )
            .forEach((player) => {
              media[player.user_id] = { camera: true, mike: true };
            });

          console.log(
            `[${roundName}] playerMediaStatus : 최대 투표를 받은 유저 카메라 켬, 마이크 켬`
          );
          console.log(media);
          mafiaIo.to(roomId).emit("playerMediaStatus", media);

          console.log(`${roundName} 종료`);
          roundName = "r1-9";
        } else if (roundName == "r1-9") {
          console.log(`${roundName} 시작`);
          time = 10;

          console.log(`[${roundName}] timerStatus : 10초`);
          mafiaIo.to(roomId).emit("timerStatus", time);

          console.log(`${roundName} 종료`);
          roundName = "r1-10";
        } else if (roundName == "r1-10") {
          console.log(`${roundName} 시작`);
          time = 1;

          let media = {};
          allPlayers
            .filter(
              (player) => player.user_id === mostVoteResult.result.user_id
            )
            .forEach((player) => {
              media[player.user_id] = { camera: true, mike: false };
            });

          console.log(
            `[${roundName}] playerMediaStatus : 모든 유저 카메라 켬, 마이크 끔`
          );
          console.log(media);
          mafiaIo.to(roomId).emit("playerMediaStatus", media);

          console.log(`${roundName} 종료`);
          roundName = "r1-11";
        } else if (roundName == "r1-11") {
          console.log(`${roundName} 시작`);
          time = 10;

          console.log(
            `[${roundName}] showModal : 찬성/반대 투표를 해주세요. / 10초`
          );
          mafiaIo
            .to(roomId)
            .emit("showModal", "찬성/반대 투표를 해주세요.", time);

          console.log(`${roundName} 종료`);
          roundName = "r1-12";
        } else if (roundName == "r1-12") {
          console.log(`${roundName} 시작`);
          time = 5;

          try {
            yesOrNoVoteResult = await getYesOrNoVoteResult(roomId); //NOTE - 찬반 투표 결과 (확정X, 동률 나올 수 있음)
            await resetVote(roomId); //NOTE - 투표 결과 리셋, 테스트 상 주석처리
          } catch (error) {
            return await playError(roundName, roomId, mafiaIo, error, start);
          }

          console.log(`[${roundName}] showVoteDeadOrLive / 5초`);
          console.log(yesOrNoVoteResult);
          mafiaIo
            .to(roomId)
            .emit("showVoteDeadOrLive", yesOrNoVoteResult, time);

          console.log(`${roundName} 종료`);
          roundName = "r1-13";
        } else if (roundName == "r1-13") {
          console.log(`${roundName} 시작`);
          time = 3;

          let killedPlayer = null;

          if (yesOrNoVoteResult.result) {
            console.log("투표 결과 유효함");
            try {
              killedPlayer = await killPlayer(mostVoteResult.result.user_id); //NOTE - 투표를 가장 많이 받은 플레이어 사망

              allPlayers = await getPlayersInRoom(roomId);
            } catch (error) {
              return await playError(roundName, roomId, mafiaIo, error, start);
            }

            console.log(`[${roundName}] diedPlayer : ${killedPlayer}`);
            mafiaIo.to(roomId).emit("diedPlayer", killedPlayer);

            const isPlayerMafia = allPlayers
              .filter((player) => player.role === "마피아")
              .some((player) => player.user_id === killedPlayer);

            //NOTE - 죽은 플레이어가 마피아인지 시민인지 알림
            if (isPlayerMafia) {
              console.log(
                `[${roundName}] showModal : 마피아가 죽었습니다. / 3초`
              );
              mafiaIo
                .to(roomId)
                .emit("showModal", "마피아가 죽었습니다.", time);
            } else {
              console.log(
                `[${roundName}] showModal : 시민이 죽었습니다. / 3초`
              );
              mafiaIo.to(roomId).emit("showModal", "시민이 죽었습니다.", time);
            }
          } else {
            //NOTE - 투표 실패, 동률이 나옴
            console.log(
              `[${roundName}] showModal : 아무도 죽지 않았습니다. / 3초`
            );
            mafiaIo
              .to(roomId)
              .emit("showModal", "아무도 죽지 않았습니다.", time);
          }

          console.log(`${roundName} 종료`);
          roundName = "r1-14";
        } else if (roundName == "r1-14") {
          console.log(`${roundName} 시작`);
          time = 1;

          let media = {};
          allPlayers.forEach((player) => {
            media[player.user_id] = { camera: false, mike: false };
          });

          console.log(
            `[${roundName}] playerMediaStatus : 모든 유저 카메라 끔, 마이크 끔`
          );
          mafiaIo.to(roomId).emit("playerMediaStatus", media);

          console.log(`${roundName} 종료`);
          roundName = "r1-15";
        } else if (roundName === "r1-15") {
          console.log(`${roundName} 시작`);
          time = 3;

          console.log(
            `[${roundName}] showModal : 밤이 되었습니다. 마피아는 제스처를 통해 상의 후 누구를 죽일 지 선택해주세요. / 3초`
          );
          mafiaIo
            .to(roomId)
            .emit(
              "showModal",
              "밤이 되었습니다. 마피아는 제스처를 통해 상의 후 누구를 죽일 지 선택해주세요.",
              time
            );

          console.log(`${roundName} 종료`);
          roundName = "r1-16";
        } else if (roundName === "r1-16") {
          console.log(`${roundName} 시작`);
          time = 1;

          let media = {};
          const mafiaPlayers = allPlayers
            .filter((player) => player.is_lived === true)
            .filter((player) => player.role === "마피아")
            .map((player) => player.user_id);

          mafiaPlayers.forEach(
            (userId) => (media[userId] = { camera: true, mike: false })
          );

          console.log(
            `[${roundName}] playerMediaStatus : 마피아 유저들 카메라 켬, 마이크 끔`
          );

          mafiaPlayers.forEach((userId) => {
            mafiaIo.to(userId).emit("playerMediaStatus", media);
          });

          console.log(`${roundName} 종료`);
          roundName = "r1-17";
        } else if (roundName === "r1-17") {
          console.log(`${roundName} 시작`);
          time = 10;

          console.log(`[${roundName}] inSelect : mafia /  10초`);
          mafiaIo.to(roomId).emit("inSelect", "mafia", time);

          console.log(`${roundName} 종료`);
          roundName = "r1-18";
        } else if (roundName === "r1-18") {
          console.log(`${roundName} 시작`);
          time = 1;

          let media = {};
          const mafiaPlayers = allPlayers
            .filter((player) => player.is_lived == true)
            .filter((player) => player.role == "마피아")
            .map((player) => player.user_id);

          mafiaPlayers.forEach(
            (userId) => (media[userId] = { camera: false, mike: false })
          );

          console.log(
            `[${roundName}] playerMediaStatus : 마피아 유저들 카메라 끔, 마이크 끔`
          );

          mafiaPlayers.forEach((userId) => {
            mafiaIo.to(userId).emit("playerMediaStatus", media);
          });

          console.log(`${roundName} 종료`);
          // doctorMaxCount = 0; //FIXME - 테스트 코드
          // policeMaxCount = 0; //FIXME - 테스트 코드
          console.log("의사", doctorMaxCount, "경찰", policeMaxCount); //FIXME - 테스트 코드
          if (doctorMaxCount === 0 && policeMaxCount === 0) {
            roundName = "r2-0";
          } else if (doctorMaxCount == 0 && policeMaxCount > 0) {
            roundName = "r1-21";
          } else {
            roundName = "r1-19";
          }
        } else if (roundName == "r1-19") {
          console.log(`${roundName} 시작`);
          time = 3;

          console.log(
            `[${roundName}] showModal : 의사는 누구를 살릴 지 결정해주세요. / 3초`
          );
          mafiaIo
            .to(roomId)
            .emit("showModal", "의사는 누구를 살릴 지 결정해주세요.", time);

          console.log(`${roundName} 종료`);
          roundName = "r1-20";
        } else if (roundName == "r1-20") {
          console.log(`${roundName} 시작`);
          time = 10;

          console.log(`[${roundName}] inSelect : doctor / 10초`);
          mafiaIo.to(roomId).emit("inSelect", "doctor", time);

          console.log(`${roundName} 종료`);
          if (policeMaxCount > 0) {
            roundName = "r1-21";
          } else {
            roundName = "r2-0";
          }
        } else if (roundName == "r1-21") {
          console.log(`${roundName} 시작`);
          time = 3;

          console.log(
            `[${roundName}] showModal : 경찰은 마피아 의심자를 결정해주세요. / 3초`
          );
          mafiaIo
            .to(roomId)
            .emit("showModal", "경찰은 마피아 의심자를 결정해주세요.", time);

          console.log(`${roundName} 종료`);
          roundName = "r1-22";
        } else if (roundName == "r1-22") {
          console.log(`${roundName} 시작`);
          time = 10;

          console.log(`[${roundName}] inSelect : police / 10초`);
          mafiaIo.to(roomId).emit("inSelect", "police", time);

          console.log(`${roundName} 종료`);
          roundName = "r2-0";
        } else if (roundName == "r2-0") {
          console.log(`${roundName} 시작`);
          time = 3;

          let mostVotedPlayer = null;
          let playerToKill = null;
          let playerToSave = null;
          let killedPlayer = null;

          try {
            voteBoard = await getVoteToResult(roomId); //NOTE - 투표 결과 확인 (누가 얼마나 투표를 받았는지)
            mostVoteResult = getMostVotedPlayer(voteBoard, true); //NOTE - 투표를 가장 많이 받은 사람 결과 (확정X, 동률일 가능성 존재)
            mostVotedPlayer = mostVoteResult.result;
            console.log("투표 당선", mostVotedPlayer); //FIXME - 테스트 코드
            await resetVote(roomId); //NOTE - 플레이어들이 한 투표 기록 리셋, 테스트용으로 잠시 주석처리
          } catch (error) {
            return await playError(roundName, roomId, mafiaIo, error, start);
          }

          playerToKill = mostVotedPlayer.user_id;

          const mafiaPlayers = allPlayers
            .filter((player) => player.is_lived == true)
            .filter((player) => player.role === "마피아")
            .map((player) => player.user_id);

          let doctorPlayer = null;
          try {
            if (doctorMaxCount > 0) {
              doctorPlayer = allPlayers
                .filter((player) => player.is_lived == true)
                .find((player) => player.role === "의사")?.user_id;

              playerToSave = await getSelectedPlayer(roomId);
            }

            console.log(
              "죽일 플레이어",
              playerToKill,
              "살릴 사람",
              playerToSave
            ); //FIXME - 테스트 코드

            if (playerToKill !== playerToSave) {
              if (mafiaPlayers) {
                killedPlayer = await killPlayer(playerToKill);
              }

              if (doctorPlayer) {
                await savePlayer(playerToSave);
              }
            }

            await resetSelectedPlayer(roomId);
            allPlayers = await getPlayersInRoom(roomId);
          } catch (error) {
            return await playError(roundName, roomId, mafiaIo, error, start);
          }

          if (killedPlayer) {
            console.log(
              `[${roundName}] : ${mostVotedPlayer.user_nickname}님이 죽었습니다. / 3초`
            );
            mafiaIo
              .to(roomId)
              .emit(
                "showModal",
                `${mostVotedPlayer.user_nickname}님이 죽었습니다.`,
                time
              );
            console.log("죽은 사람", killedPlayer);
            console.log(`[${roundName}] diedPlayer : ${killedPlayer}`);
            mafiaIo.to(roomId).emit("diedPlayer", killedPlayer);
          } else {
            console.log(
              `[${roundName}] : ${mostVotedPlayer.user_nickname}님이 의사의 활약으로 아무도 죽지 않았습니다. / 3초 (마피아 유저에게)`
            );

            allPlayers
              .filter((player) => player.role === "마피아")
              .map((player) => player.user_id)
              .forEach((player) => {
                mafiaIo
                  .to(player)
                  .emit(
                    "showModal",
                    `${mostVotedPlayer.user_nickname}님이 의사의 활약으로 아무도 죽지 않았습니다.`,
                    time
                  );
              });

            console.log(
              `[${roundName}] : 의사의 활약으로 아무도 죽지 않았습니다. / 3초 (마피아가 아닌 유저에게)`
            );
            allPlayers
              .filter((player) => player.role !== "마피아")
              .map((player) => player.user_id)
              .forEach((player) => {
                mafiaIo
                  .to(player)
                  .emit(
                    "showModal",
                    "의사의 활약으로 아무도 죽지 않았습니다.",
                    time
                  );
              });
          }

          console.log(`${roundName} 종료`);
          roundName = "r1-0";
        }
      }
    }, 1000);
  });

  socket.on("voteTo", async (votedPlayer) => {
    console.log(`[voteTo] 투표 대상 : ${votedPlayer}`);

    try {
      await voteTo(votedPlayer, new Date());
    } catch (error) {
      console.log(`[voteToError] ${error.message}`);
      socket.emit("voteToError", error.message);
    }
  });

  socket.on("voteYesOrNo", async (yesOrNo) => {
    console.log(`[voteYesOrNo] 찬성/반대 : ${yesOrNo}`);
    const userId = socket.data.userId;

    try {
      await voteYesOrNo(userId, yesOrNo);
    } catch (error) {
      console.log(`[voteYesOrNoError] ${error.message}`);
      socket.emit("[voteYesOrNoError]", error.message);
    }
  });

  socket.on("selectPlayer", async (selectedPlayer) => {
    console.log(
      `[selectedPlayer] 의사에 의해 선택받은 플레이어 : ${selectedPlayer}`
    );

    try {
      await selectPlayer(selectedPlayer);
    } catch (error) {
      console.log(`[selectPlayerError] ${error.message}`);
      socket.emit("selectPlayerError", error.message);
    }
  });
});

httpServer.listen(port, () => {
  console.log(`port(${port})으로 실행 중`);
});

const canGameStart = async (roomId) => {
  console.log("게임 진행 가능 확인");
  let canStart = false;
  try {
    const { total_user_count: totalUserCount } = await getUserCountInRoom(
      roomId
    );
    console.log("총 인원 :", totalUserCount);
    console.log("룸 아이디", roomId);

    const isAllPlayerEnoughCount = await checkPlayerCountEnough(
      roomId,
      totalUserCount
    ); //NOTE - 플레이어들이 방 정원을 채웠는지
    const isAllPlayersReady = await checkAllPlayersReady(
      roomId,
      totalUserCount
    ); //NOTE - 플레이어들이 전부 레디했는지

    canStart = isAllPlayerEnoughCount && isAllPlayersReady;
    console.log(
      "인원 충분 : ",
      isAllPlayerEnoughCount,
      "전부 레디 : ",
      isAllPlayersReady
    );

    const chief = await getChief(roomId);

    if (canStart) {
      console.log(`[chiefStart] ${chief} ${canStart}`);
      mafiaIo.to(chief).emit("chiefStart", canStart);
    } else {
      console.log(`[chiefStart] ${chief} ${canStart}`);
      mafiaIo.to(chief).emit("chiefStart", canStart);
    }
  } catch (error) {
    console.log(`[canGameStartError] ${error.message}`);
    mafiaIo.to(roomId).emit("canGameStartError", error.message);
  }
};
