const FEISHU_BASE = 'https://open.feishu.cn/open-apis';

export async function getAppToken(appId, appSecret) {
  const res = await fetch(`${FEISHU_BASE}/auth/v3/app_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书认证失败: ${data.msg}`);
  }
  return data.app_access_token;
}

export async function sendMessage(token, chatId, content) {
  const res = await fetch(`${FEISHU_BASE}/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text: content }),
    }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书发送失败: ${data.msg}`);
  }
  return data;
}

export async function sendRichTextMessage(token, chatId, post) {
  const res = await fetch(`${FEISHU_BASE}/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'post',
      content: JSON.stringify({
        post: {
          zh_cn: post,
        },
      }),
    }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书富文本发送失败: ${data.msg}`);
  }
  return data;
}

export async function sendFileMessage(token, chatId, fileKey) {
  const res = await fetch(`${FEISHU_BASE}/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'file',
      content: JSON.stringify({ file_key: fileKey }),
    }),
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书文件发送失败: ${data.msg}`);
  }
  return data;
}

export async function uploadFile(token, fileName, content) {
  const formData = new FormData();
  formData.append('file_type', 'stream');
  formData.append('file_name', fileName);
  formData.append('file', new Blob([content], { type: 'text/markdown' }));
  const res = await fetch(`${FEISHU_BASE}/im/v1/files`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`飞书上传失败: ${data.msg}`);
  }
  return data.data.file_key;
}
