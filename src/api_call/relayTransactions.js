import axios from "axios";

const mainAxios = axios.create({
  baseURL: "http://localhost:8080",
});

async function relayTransactions(params) {
  try {
    const response = await mainAxios(params);

    console.log(response.data)
    return response.data;
  } catch (error) {
    throw new Error(error.message.data);
  }
}

export { relayTransactions };