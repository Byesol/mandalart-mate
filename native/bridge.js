import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Browser} from '@capacitor/browser';
import {Camera, CameraResultType, CameraSource} from '@capacitor/camera';
import {Directory, Filesystem} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {createNativeAuth} from './auth.js';

const hostedMates = 'https://mandalart-mate-goals.aridninja3.chatgpt.site/#mates';

function base64Of(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function choosePhoto() {
  const photo = await Camera.getPhoto({
    source: CameraSource.Prompt,
    resultType: CameraResultType.Uri,
    quality: 85,
    width: 1100,
    height: 1100,
    correctOrientation: true,
    promptLabelHeader: '목표 사진',
    promptLabelPhoto: '앨범에서 선택',
    promptLabelPicture: '사진 찍기'
  });
  const response = await fetch(photo.webPath);
  if (!response.ok) throw new Error('사진을 읽을 수 없어요.');
  const blob = await response.blob();
  const extension = photo.format || 'jpeg';
  return new File([blob], 'mandalart-photo.' + extension, {type: blob.type || 'image/' + extension});
}

async function shareImage(blob, name) {
  const destination = await Filesystem.writeFile({
    path: 'mandalart/' + name,
    directory: Directory.Cache,
    recursive: true,
    data: await base64Of(blob)
  });
  await Share.share({title: name, files: [destination.uri], dialogTitle: '만다라트 이미지'});
}

if (Capacitor.isNativePlatform()) {
  globalThis.MandalartNative = Object.freeze({
    choosePhoto,
    shareImage,
    auth: createNativeAuth(MANDALART_AUTH_CONFIG),
    openMates: () => Browser.open({url: hostedMates}),
    onBack: callback => {
      if (Capacitor.getPlatform() === 'android') App.addListener('backButton', callback);
    },
    closeApp: () => App.exitApp()
  });
}
