import { getVoteYesOrNoResult } from "../supabase/gamePlayAPI.js";

//NOTE - 클라이언트의 화면에 모달창을 띄움
export const showModal = (
  mafiaIo,
  roomName,
  eventName,
  title,
  message,
  timer,
  nickname,
  yesOrNo
) => {
  mafiaIo
    .to(roomName)
    .emit(eventName, title, message, timer, nickname, yesOrNo);
};

//NOTE - 참가자들 랜덤으로 섞기(피셔-예이츠 셔플 알고리즘)
export const shufflePlayers = (allPlayers) => {
  for (let i = allPlayers.length - 1; i >= 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [allPlayers[i], allPlayers[j]] = [allPlayers[j], allPlayers[i]];
  }
  return allPlayers;
};

//NOTE - 플레이어에게 다른 플레이어의 역할 공개
export const openPlayerRole = (mafiaIo, clientUserId, roleUserId, role) => {
  mafiaIo.to(clientUserId).emit("openPlayerRole", roleUserId, role);
};

//NOTE - 표를 가장 많이 받은 플레이어 확인
export const getMostVotedPlayer = (voteBoard) => {
  const isValid = voteBoard[0].voted_count !== voteBoard[1].voted_count;

  if (isValid) {
    return { isValid, result: voteBoard[0] };
  } else {
    const shuffledPlayers = shufflePlayers(voteBoard);
    return { isValid, result: shuffledPlayers[0] };
  }
};

//NOTE - 유저들에게 마피아 지목 투표 결과 보여줌
export const showVoteToResult = (mafiaIo, roomId, eventName, voteBoard) => {
  mafiaIo.to(roomId).emit(eventName, voteBoard);
};

//NOTE - 찬성 반대 투표 결과
export const getYesOrNoVoteResult = async (roomId) => {
  const voteResult = await getVoteYesOrNoResult(roomId);
  let yesCount = 0;
  let noCount = 0;

  voteResult.forEach((vote) => {
    if (vote === true) {
      yesCount++;
    } else if (vote === false) {
      noCount++;
    }
  });

  return {
    result: yesCount > noCount,
    detail: { yesCount, noCount },
  };
};

//NOTE - 유저들에게 찬성/반대 투표 결과 보여줌
export const showVoteYesOrNoResult = async (
  mafiaIo,
  roomId,
  eventName,
  voteResult
) => {
  mafiaIo.to(roomId).emit(eventName, voteResult);
};

//NOTE - 어느 팀이 이겼는지 결과 반환
export const whoWins = (allPlayers) => {
  const mafiaPlayers = allPlayers
    .filter((player) => player.is_lived === true)
    .filter((player) => player.role === "마피아");
  const citizenPlayers = allPlayers
    .filter((player) => player.is_lived === true)
    .filter((player) => player.role !== "마피아");
  let mafiaCount;
  let citizenCount;

  mafiaPlayers.length > 0
    ? (mafiaCount = mafiaPlayers.length)
    : (mafiaCount = 0);

  citizenPlayers.length > 0
    ? (citizenCount = citizenPlayers.length)
    : (citizenCount = 0);

  if (mafiaCount === 0) {
    return { isValid: true, result: "시민" };
  }

  if (mafiaCount >= citizenCount) {
    return { isValid: true, result: "마피아" };
  }

  return { isValid: false };
};

export const showWhoWins = async (gameOver) => {
  console.log("showWhoWins 송신");

  //NOTE - 게임 종료 만족하는 지
  console.log(`${gameOver.result}팀이 이겼습니다.`);

  mafiaIo.to(roomId).emit("gameOver", `${gameOver.result}팀이 이겼습니다.`);
};

export const getRoleMaxCount = (totalCount) => {
  switch (totalCount) {
    case 5:
      return [1, 0, 0];
    case 6:
      return [2, 1, 0];
    case 7:
      return [2, 1, 0];
    case 8:
      return [3, 1, 1];
    case 9:
      return [3, 1, 1];
    case 10:
      return [3, 1, 1];
  }
};

export const gameError = async (roundName, error) => {
  await initGame(roomId);
  console.log(`[playError] ${roundName}, ${error.message}`); //FIXME - 테스트용 코드
  mafiaIo.to(roomId).emit("playError", roundName, error.message);
  clearInterval(start);
};
