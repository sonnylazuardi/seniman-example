import * as fs from "fs";
import { useEffect, useState, useWindow, useMemo, onCleanup } from "seniman";
import { createServer } from "seniman/server";
import { proxy, subscribe } from "valtio";
import { subscribeKey } from "valtio/utils";
import { createClient } from "@supabase/supabase-js";
import { randomize, getScore, answeredBefore } from "./questions.js";
import Onboarding from "./onboarding.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const tailwindCssText = fs.readFileSync("./output/output.css", "utf8");
const state = proxy({
  messages: [],
  online: [],
  answers: [],
  leaderboard: [],
  timer: 0,
  question: randomize(),
});

supabase
  .from("leaderboard")
  .select()
  .then(({ data }) => {
    state.leaderboard = data;
  })
  .catch((e) => console.error(e));

const CHAT_LIMIT = 40;
const TIMER_LIMIT = 15;

let interval = setInterval(() => {
  state.timer++;
  if (state.timer >= TIMER_LIMIT) {
    state.timer = 0;
    state.answers = [];
    state.question = randomize();
  }
}, 1000);

function useTypingModeEnabled() {
  let window = useWindow();
  let [getTypingModeEnabled, setTypingModeEnabled] = useState(false);

  let _handle = (value) => {
    // TODO: false value from the client is currently sent as empty string
    setTypingModeEnabled(!!value);
  };

  window.clientExec(
    $c(() => {
      const VIEWPORT_VS_CLIENT_HEIGHT_RATIO = 0.75;
      window.visualViewport.addEventListener("resize", (event) => {
        let typingModeShouldBeEnabled =
          (event.target.height * event.target.scale) / window.screen.height <
          VIEWPORT_VS_CLIENT_HEIGHT_RATIO;

        $s(_handle)(typingModeShouldBeEnabled);
      });
    })
  );

  return getTypingModeEnabled;
}

const DEFAULT_ME = "anonim";

function Body() {
  let window = useWindow();
  let [getTimer, setTimer] = useState(state.timer);
  let [getQuestion, setQuestion] = useState(state.question);
  let [getLeaderboard, setLeaderboard] = useState(state.leaderboard);
  let [getEditMe, setEditMe] = useState(false);
  let [getText, setText] = useState("");
  let [getMessages, setMessages] = useState(state.messages);
  let [getOnline, setOnline] = useState(state.online);

  let typingModeEnabled = useTypingModeEnabled();

  let userNameCookie = window.cookie("__acakata_user");

  let [getShowOnboard, setShowOnboard] = useState(false);

  let getMe = useMemo(() => {
    return userNameCookie() || DEFAULT_ME;
  });

  const updateUserName = (name) => {
    window.setCookie("__acakata_user", name);
  };

  const unsubscribeMessage = subscribeKey(state, "messages", (messages) => {
    setMessages(messages);
    window.clientExec(
      $c(() => {
        setTimeout(() => {
          const messages = document.getElementById("messages");
          messages.scrollTop = messages.scrollHeight;
        });
      })
    );
  });

  const unsubscribe = subscribe(state, () => {
    setTimer(state.timer);
    setQuestion(state.question);
    setLeaderboard(state.leaderboard);
    setOnline(state.online);
  });

  useEffect(() => {
    if (!typingModeEnabled()) {
      window.clientExec(
        $c(() => {
          setTimeout(() => {
            window.scrollTo(0, 0);
          }, 200);
        })
      );
    }
  });

  useEffect(() => {
    if (getMe() === DEFAULT_ME) setShowOnboard(true);
  }, []);

  window.clientExec(
    $c(() => {
      loadScript("");
      let script = document.createElement("script");
      script.setAttribute(
        "data-website-id",
        "3d721788-abb6-44b1-ac87-bae3004ecf01"
      );
      script.src = "https://analytics.umami.is/script.js";
      document.head.appendChild(script);

      setTimeout(() => {
        const messages = document.getElementById("messages");
        messages.scrollTop = messages.scrollHeight;
      }, 200);
    })
  );

  onCleanup(() => {
    unsubscribe();
    unsubscribeMessage();
    state.online = state.online.filter((online) => online !== getMe());
  });

  useEffect(() => {
    if (!state.online.includes(getMe())) {
      state.online = [...state.online, getMe()];
    }
  });

  const addScore = async (player, score) => {
    const { data: currentData } = await supabase
      .from("leaderboard")
      .select()
      .eq("player", player);
    const upsertPayload = {
      player,
      score: !currentData.length
        ? score
        : parseInt(currentData[0]?.score + score),
    };
    await supabase.from("leaderboard").upsert(upsertPayload);
    const { data } = await supabase.from("leaderboard").select();
    state.leaderboard = data;
  };

  let onClick = () => {
    let answer = getText();
    if (answer !== "") {
      if (
        answer.toUpperCase() === state.question?.answer &&
        !answeredBefore(state.answers, getMe())
      ) {
        const currentAnswer = { player: getMe(), rank: state.answers.length };
        state.answers = [...state.answers, currentAnswer];

        const score = getScore(currentAnswer.rank);
        addScore(getMe(), score);
        answer = `Menjawab dengan benar (+${score})`;
      }
      state.messages = [
        ...state.messages.filter(
          (_, i) => state.messages.length - i <= CHAT_LIMIT
        ),
        { player: getMe(), message: answer },
      ];
      setText("");
    }
  };

  return (
    <div class="relative flex min-h-screen flex-col justify-start overflow-hidden bg-gray-50">
      {getShowOnboard() ? (
        <Onboarding
          userName={getMe()}
          updateUserName={updateUserName}
          setShowOnboard={setShowOnboard}
        />
      ) : null}

      <div
        class="relative bg-white px-6 pt-10 pb-8 shadow-xl ring-1 ring-gray-900/5 sm:mx-auto max-w-screen-lg sm:rounded-lg sm:px-10 w-full flex"
        id="main"
        style={{
          paddingTop: typingModeEnabled() ? "450px" : "24px",
          height: "100vh",
        }}
      >
        <div class="divide-y divide-gray-300/50 flex flex-col w-full">
          <div class="flex flex-row justify-between pb-6 items-center">
            <div class="text-2xl font-bold">
              <button onClick={() => setShowOnboard(true)}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="24"
                  viewBox="0 0 24 24"
                  width="24"
                >
                  <path
                    fill="currentColor"
                    d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"
                  ></path>
                </svg>
              </button>
              Acakata → {getQuestion()?.randomAnswer}{" "}
              <span class="text-base font-normal ml-1">
                {getQuestion()?.question}
              </span>
            </div>
            <div class="text-2xl font-bold p-1 w-8 h-8">
              {TIMER_LIMIT - getTimer()}
            </div>
          </div>
          <div
            class="flex flex-row bg-neutral-50 overflow-y-hidden h-20 items-center space-x-2 px-4"
            id="leaderboard"
            style={{
              display: typingModeEnabled() ? "none" : "inherit",
            }}
          >
            <div>{getOnline().length} online</div>
            {(getLeaderboard() || [])
              .sort((a, b) => b.score - a.score)
              .map((leaderboard) => {
                const isOnline = getOnline().includes(leaderboard.player);
                const isMe = getMe() === leaderboard.player;
                return (
                  <div
                    class={`flex flex-row rounded-lg items-center justify-center py-1 px-3 relative ${
                      isMe
                        ? " bg-neutral-50 border border-neutral-500"
                        : " bg-neutral-500 text-white"
                    }`}
                  >
                    <div>{leaderboard.player}</div>
                    <div class="font-semibold ml-1">{leaderboard.score}</div>
                    {isOnline ? (
                      <div class="w-3 h-3 bg-green-500 absolute -top-1 -right-1 rounded-full border-2 border-neutral-50"></div>
                    ) : null}
                  </div>
                );
              })}
          </div>
          <div
            class="space-y-2 py-8 text-base leading-7 text-gray-600 flex flex-col justify-start items-start overflow-y-auto flex-1"
            id="messages"
          >
            {getMessages().map((message) => {
              return (
                <div class="bg-neutral-50 py-2 px-3 rounded-lg">
                  <div class="font-semibold">{message.player}</div>
                  {message.message}
                </div>
              );
            })}
          </div>
          <div
            class="pt-8 text-base leading-7 flex flex-row space-x-4"
            id="actions"
            style={{
              paddingBottom: typingModeEnabled() ? "0" : "80px",
            }}
          >
            <div
              class="flex justify-center items-center cursor-pointer"
              onClick={() => setEditMe(true)}
            >
              {!getEditMe() ? (
                getMe()
              ) : (
                <input
                  value={getMe()}
                  onBlur={$c((e) => {
                    $s(updateUserName)(e.target.value);
                    $s(setEditMe)(false);
                  })}
                  type="text"
                  class="border rounded-lg border-neutral-75 px-4 py-2 w-full"
                ></input>
              )}
            </div>

            <input
              value={getText()}
              onBlur={$c((e) => {
                $s(setText)(e.target.value);
              })}
              onKeyDown={$c((e) => {
                if (e.key === "Enter") {
                  $s(setText)(e.target.value);
                  $s(onClick)();
                  e.target.value = "";
                }
              })}
              placeholder="Message"
              type="text"
              class="border rounded-lg border-neutral-75 px-4 py-2 w-full"
            ></input>
            <button
              class="p-4 bg-white font-semibold hover:bg-neutral-50 rounded-lg"
              onClick={onClick}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Head() {
  return (
    <>
      <style>{tailwindCssText}</style>
    </>
  );
}

let server = createServer({ Body, Head });

server.listen(3002);
