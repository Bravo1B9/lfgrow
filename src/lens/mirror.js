import { gql } from '@apollo/client/core';
import { BigNumber, utils } from 'ethers';
import { apolloClient } from '../helpers/apollo-client';
import { login } from '@/lens/login-users';
import { signedTypeData, splitSignature, getAddress } from '@/helpers/ethers-service';
import { pollUntilIndexed } from "./utils/has-transaction-been-indexed";
import { lensHub } from '@/lens/utils/lens-hub';

const CREATE_MIRROR_TYPED_DATA = `
  mutation($request: CreateMirrorRequest!) { 
    createMirrorTypedData(request: $request) {
      id
      expiresAt
      typedData {
        types {
          MirrorWithSig {
            name
            type
          }
        }
      domain {
        name
        chainId
        version
        verifyingContract
      }
      value {
        nonce
        deadline
        profileId
        profileIdPointed
        pubIdPointed
        referenceModule
        referenceModuleData
      }
     }
   }
 }
`;

// TODO types
const createMirrorTypedData = (createMirrorTypedDataRequest) => {
  return apolloClient.mutate({
    mutation: gql(CREATE_MIRROR_TYPED_DATA),
    variables: {
      request: createMirrorTypedDataRequest,
    },
  });
};

export const createMirror = async (_profileId, _pubId) => {
  
  const profileId = _profileId

  if (!profileId && !_pubId) {
    throw new Error('Must define PROFILE_ID in the .env to run this');
  }

  await login();

  // hard coded to make the code example clear
  const createMirrorRequest = {
    profileId,
    // remember it has to be indexed and follow metadata standards to be traceable!
    publicationId: _pubId,
    referenceModule: {
      followerOnlyReferenceModule: false,
    },
  };

  const result = await createMirrorTypedData(createMirrorRequest);
  console.log('create mirror: createMirrorTypedData', result);

  const typedData = result.data.createMirrorTypedData.typedData;
  console.log('create mirror: typedData', typedData);

  const signature = await signedTypeData(typedData.domain, typedData.types, typedData.value);
  console.log('create mirror: signature', signature);

  const { v, r, s } = splitSignature(signature);

  const tx = await lensHub.mirrorWithSig({
    profileId: typedData.value.profileId,
    profileIdPointed: typedData.value.profileIdPointed,
    pubIdPointed: typedData.value.pubIdPointed,
    referenceModule: typedData.value.referenceModule,
    referenceModuleData: typedData.value.referenceModuleData,
    sig: {
      v,
      r,
      s,
      deadline: typedData.value.deadline,
    },
  });
  console.log('create mirror: tx hash', tx.hash);

  console.log('create mirror: poll until indexed');
  const indexedResult = await pollUntilIndexed(tx.hash);

  console.log('create mirror: profile has been indexed', result);

  const logs = indexedResult.txReceipt.logs;

  console.log('create mirror: logs', logs);

  const topicId = utils.id('MirrorCreated(uint256,uint256,uint256,uint256,address,bytes,uint256)');
  console.log('topicid we care about', topicId);

  const profileCreatedLog = logs.find((l) => l.topics[0] === topicId);
  console.log('create mirror: created log', profileCreatedLog);

  let profileCreatedEventLog = profileCreatedLog.topics;
  console.log('create mirror: created event logs', profileCreatedEventLog);

  const publicationId = utils.defaultAbiCoder.decode(['uint256'], profileCreatedEventLog[2])[0];

  console.log(
    'create mirror: contract publication id',
    BigNumber.from(publicationId).toHexString()
  );
  console.log(
    'create mirror: internal publication id',
    profileId + '-' + BigNumber.from(publicationId).toHexString()
  );

  return result.data;
};