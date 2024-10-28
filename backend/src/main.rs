use std::borrow::Cow;
use std::collections::HashMap;

use rocket::fairing::{Fairing, Info, Kind};
use rocket::http::Header;
use rocket::serde::json::{self, json, Json, Value};
use rocket::serde::{Deserialize, Serialize};
use rocket::tokio::sync::{Mutex, RwLock};
use rocket::{response, State};
use rocket::{Request, Response};

pub struct CORS;

use uuid::Uuid;

#[rocket::async_trait]
impl Fairing for CORS {
    fn info(&self) -> Info {
        Info {
            name: "Add CORS headers ta responses",
            kind: Kind::Response,
        }
    }

    async fn on_response<'r>(&self, _request: &'r Request<'_>, response: &mut Response<'r>) {
        response.set_header(Header::new("Access-Control-Allow-Origin", "*"));
        response.set_header(Header::new(
            "Access-Control-Allow-Methods",
            "POST, GET, PATCH, OPTIONS",
        ));
        response.set_header(Header::new("Access-Control-Allow-Headers", "*"));
        response.set_header(Header::new("Access-Control-Allow-Credentials", "true"));
    }
}

#[macro_use]
extern crate rocket;

type Id = usize;

// type MessageList = Mutex<Vec<String>>;
// type Messages<'r> = &'r State<MessageList>;

type OfferList = RwLock<HashMap<Uuid, Offer>>;
type ResponseList = RwLock<HashMap<Uuid, Reply>>;
// type Offers<'r> = &'r State<OfferList>;

#[derive(Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
struct Offer {
    offer: String,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
struct Reply {
    id: Uuid,
    offer: String,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
struct Check {
    id: Uuid,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
struct Message<'r> {
    id: Option<Id>,
    message: Cow<'r, str>,
}

#[post("/create_offer", format = "json", data = "<message>")]
async fn create_offer(message: Json<Offer>, offer_list: &State<OfferList>) -> Value {
    let uuid = Uuid::new_v4();
    let mut offers = offer_list.write().await;
    offers.insert(uuid, message.into_inner());

    json!({"status": "ok", "id": uuid})
}

#[post("/send_reply", format = "json", data = "<message>")]
async fn send_reply(
    message: Json<Reply>,
    offer_list: &State<OfferList>,
    response_list: &State<ResponseList>,
) -> Option<Value> {
    let offers = offer_list.read().await;
    let offer = offers.get(&message.id).map(|x| json!({"offer": x.offer}));
    match offer {
        Some(x) => {
            let mut responses = response_list.write().await;
            responses.insert(message.id, message.into_inner());
            Some(x)
        }
        None => None,
    }
}

#[post("/get_reply", format = "json", data = "<message>")]
async fn get_reply(message: Json<Check>, reply_list: &State<ResponseList>) -> Option<Value> {
    reply_list
        .read()
        .await
        .get(&message.id)
        .map(|x| json!({"reply": x.offer}))
}

#[options("/<_..>")]
fn all_options() {
    // Empty
}

#[launch]
fn rocket() -> _ {
    rocket::build()
        .mount(
            "/",
            routes![create_offer, all_options, send_reply, get_reply],
        )
        .manage(OfferList::new(HashMap::new()))
        .manage(ResponseList::new(HashMap::new()))
        .attach(CORS)
}
