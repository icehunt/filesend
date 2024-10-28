use gloo_utils::format::JsValueSerdeExt;
use js_sys::{Array, Object, Reflect, JSON};
use serde_json::json;
use std::borrow::{Borrow, BorrowMut};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen_futures::JsFuture;
use yew::prelude::*;
use yew::{html::NodeRef, html::Scope, Context};
use yew_router::prelude::*;
// use fast_qr::convert::ConvertError;
use fast_qr::convert::{svg::SvgBuilder, Builder, Shape};
use fast_qr::qr::QRBuilder;
use serde::{Deserialize, Serialize};
use wasm_bindgen::closure::Closure;
use wasm_bindgen::{JsCast, JsValue};

use gloo_console::log;
use gloo_net::http::Request;

use web_sys::{
    console, MessageEvent, RtcConfiguration, RtcDataChannel, RtcDataChannelEvent,
    RtcDataChannelInit, RtcDataChannelState, RtcIceCandidate, RtcIceConnectionState,
    RtcIceGatheringState, RtcPeerConnection, RtcPeerConnectionIceEvent, RtcSessionDescriptionInit,
};

const STUN_SERVER: &str = "stun:stun.l.google.com:19302";

#[derive(Clone, Routable, PartialEq)]
enum Route {
    #[at("/")]
    Home,
    #[at("/send/:dest")]
    Send { dest: String },
    #[at("/recieve")]
    Recieve,
    #[not_found]
    #[at("/404")]
    NotFound,
}

fn switch(routes: Route) -> Html {
    match routes {
        Route::Home => html! {
            <Home/>
        },
        Route::Send { dest } => html! {
            <Send dest={dest}/>
        },
        Route::Recieve => html! {
            <Recieve/>
        },
        _ => html! {
            <h1> { "404" } </h1>
        },
    }
}

#[derive(PartialEq, Properties)]
struct DestString {
    dest: String,
}

#[derive(Serialize, Deserialize)]
struct idResponse {
    id: String,
    status: String,
}

#[function_component(Send)]
fn send(dest: &DestString) -> Html {
    html! {
        <>
            <p>{format!("Send Page: {}", dest.dest.clone())}</p>
        </>
    }
}

#[function_component(Recieve)]
fn recieve() -> Html {
    // https://rustwasm.github.io/wasm-bindgen/examples/webrtc_datachannel.Html
    let Ok(pc) = RtcPeerConnection::new() else {
        return html! {
            <p>{"Failed to create an RTC Peer Connection Offer"}</p>
        };
    };

    let data_channel = pc.create_data_channel("FS");

    let data_channel_clone = data_channel.clone();

    let onmessage_callback = Closure::<dyn FnMut(_)>::new(move |ev: MessageEvent| {
        if let Some(message) = ev.data().as_string() {
            log!("{:?}", message);
        }
    });

    data_channel.set_onmessage(Some(onmessage_callback.as_ref().unchecked_ref()));
    onmessage_callback.forget();

    let pc_clone = pc.clone();
    let onice_callback = Closure::<dyn FnMut(_)>::new(move |ev: RtcPeerConnectionIceEvent| {
        if let Some(candidate) = ev.candidate() {
            log!("icecandidate :{:#?}", candidate.candidate());
        }
    });

    pc.set_onicecandidate(Some(onice_callback.as_ref().unchecked_ref()));
    onice_callback.forget();

    let offer = use_state(|| String::new());
    {
        let offer = offer.clone();
        use_effect_with((), move |_| {
            let offer = offer.clone();
            wasm_bindgen_futures::spawn_local(async move {
                let pc_offer = JsFuture::from(pc.create_offer()).await;
                match pc_offer {
                    Ok(v) => {
                        let offer_str = Reflect::get(&v, &JsValue::from_str("sdp"));
                        match offer_str {
                            Ok(v) => {
                                let response = Request::post("http://localhost:8000/create_offer")
                                    .json(&json!({
                                            "offer":v.as_string()
                                        }
                                    ))
                                    .expect("Failed to add msg to request")
                                    .send()
                                    .await
                                    .expect("Failed to send request")
                                    .json::<idResponse>()
                                    .await;

                                match response {
                                    Ok(v) => offer.set(v.id),
                                    Err(_) => offer.set("Failed to extract id".into()),
                                }
                            }

                            Err(_) => offer.set("Failed to extract offer".into()),
                        }
                    }

                    Err(_) => offer.set("Failed to create offer".into()),
                }

                //pc.set_local_description(&pc_offer);
                //let offer_str = pc_offer.into_serde::<String>();
                //let offer_str = pc_offer.as_string();
                //  let response = Request::post("http://localhost:8000/create_offer")
                //      .json(&offer_str)
                //      .expect("Failed to add body to request")
                //      .send()
                //      .await;
                //  log!("got resp");

                //match offer_str {
                //    Ok(v) => {
                //        let response = Request::post("http://localhost:8000/create_offer")
                //            .json(&v)
                //            .expect("Failed to add body to request")
                //            .send()
                //            .await
                //            .unwrap()
                //            .json()
                //            .await
                //            .unwrap();
                //        log!("got resp");
                //        offer.set(response)
                //    }
                //    //offer.set(v.as_string().unwrap()),
                //    Err(_) => offer.set("Failed".into()),
                //}
            });
        });
    }
    log!("sdp {:?}", (*offer).clone());
    let url = format!("https://filesend.rs/send/{}", (*offer).clone());
    let qrcode = QRBuilder::new(url).build().unwrap();

    // The following returns the code for consturing a QR Code SVGEnglish Football League One (level 3, 24 teams): Top two are automatically promoted; next four compete in play-offs, with the winner gaining the third promotion spot. The bottom four are relegated. which we can render directly
    let _svg = SvgBuilder::default()
        .shape(Shape::RoundedSquare)
        .to_str(&qrcode);
    html! {
        <>
        {Html::from_html_unchecked(_svg.into())}
            <p>{"Scan This Page With your phone"}</p>
        </>
    }
}

#[function_component(Home)]
fn home() -> Html {
    html! {
        <>
        <div class={classes!("flex", "items-center", "justify-center", "h-screen")}>
        <div class={classes!("flex", "justify-center")}>
            <p class={classes!("text-purple-500", "text-4xl", "justify-center")}>{ "FileSend" }</p>
        </div>
        <Link<Route> to={Route::Send {dest: "".to_string()}}>
            <Button name="Send"></Button>
        </Link<Route>>
        <Link<Route> to={Route::Recieve}>
            <Button name="Recieve"></Button>
        </Link<Route>>
        </div>
        </>

    }
}

#[function_component(App)]
fn app() -> Html {
    html! {
        <BrowserRouter>
            <Switch<Route> render={switch} />
        </BrowserRouter>
    }
}

fn main() {
    yew::Renderer::<App>::new().render();
}

#[derive(PartialEq, Properties)]
struct ButtonName {
    name: String,
}

#[function_component]
fn Button(name: &ButtonName) -> Html {
    html! {
        <>
        <button class={classes!("cssbuttons-io-button")}>
        {name.name.clone()}
            <div class={classes!("icon")}>
                <svg height="24" width="24" viewBox="0 0 24 24">
                   <path d="M0 0h24v24H0z" fill="none"></path>
                   <path d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z" fill="currentColor"></path>
                </svg>
            </div>
        </button>
        </>
    }
}
