import fs from 'fs'
import { localTypes } from '@sora-substrate/type-definitions'
import { ApiPromise } from '@polkadot/api';
import { options } from '@sora-substrate/api';
import { WsProvider } from '@polkadot/rpc-provider';
import { SORA_ENV } from './pullMeta';

function sortObjectByKey(value) {
  return Object.keys(value).sort().reduce((o, key) => {
    const v = value[key]
    o[key] = v
    return o
  }, {})
}

export async function generateTypesJson(env?: string) {
  console.log("NOTE: Make sure `yarn build` was run with latest types")
  let sortedTypes = sortObjectByKey(localTypes);
  const data = JSON.stringify(sortedTypes, null, 4);
  const provider = new WsProvider(SORA_ENV[env]);
  const api = new ApiPromise(options({ provider }));
  await api.isReady;
  const specVersion = api.consts.system.version.specVersion;
  await api.disconnect();
  let typesScalecodec;
  if (fs.existsSync(`packages/types/src/metadata${env ? '/' + env : ''}/types_scalecodec.json`)) {
    const currentTypes = JSON.parse(fs.readFileSync(`packages/types/src/metadata${env ? '/' + env : ''}/types_scalecodec.json`, 'utf-8'));
    typesScalecodec = JSON.stringify(convertTypes(sortedTypes, true, specVersion.toNumber(), currentTypes), null, 4);
  } else {
    typesScalecodec = JSON.stringify(convertTypes(sortedTypes, true, 1, {}), null, 4);
  }
  fs.writeFileSync(`packages/types/src/metadata${env ? '/' + env : ''}/types.json`, data);
  fs.writeFileSync(`packages/types/src/metadata${env ? '/' + env : ''}/types_scalecodec.json`, typesScalecodec);
}

generateTypesJson(process.argv[2])

function convertTypes(inputContent: object, addCustom: boolean, specVersion: number, currentTypes: object) {
  if (specVersion === 1) { //if a new file is generated for new environment
    const types = {};
    types["runtime_id"] = specVersion;
    types["versioning"] = [];
    types["versioning"].push(
      {
        runtime_range: [specVersion, null],
        types: buildTop(inputContent, addCustom)
      },
    )
    return types;
  } else { //if add new types to the existing file
    currentTypes["runtime_id"] = specVersion;
    const newTypes = buildTop(inputContent, false); //build new types structure
    let newTypesToAdd = {} //different of new types and old types
    for (let property in newTypes) { //check every parameter in new types structure
      let typeAlreadyDefined = false;
        for (let version in currentTypes["versioning"]) {
          for (let currentTypeKey in currentTypes["versioning"][version]["types"]){
          if (property === currentTypeKey) { //check if parameter definition is the same
            if (JSON.stringify(newTypes[property]) === JSON.stringify(currentTypes["versioning"][version]["types"][property])) {
              typeAlreadyDefined = true; //if parameters are the same then mark it as already defined
              break;
            }
          }
        }
      }
      if (!typeAlreadyDefined) { //if type is not defined or the definition has changed
        newTypesToAdd[property] = newTypes[property];
      }
    }
    if (Object.entries(newTypesToAdd).length > 0) { //if there is a difference between old and new types
      let foundVersion;
      for (let version in currentTypes["versioning"]) { //check if specVersion already added
        if (currentTypes["versioning"][version]["runtime_range"][0] === specVersion
          && currentTypes["versioning"][version]["runtime_range"][1] === null) {
          foundVersion = currentTypes["versioning"][version];
        }
      }
      if (foundVersion) { //if specVersion added then add new types there
        foundVersion["types"] = {
          ...foundVersion["types"],
          ...newTypesToAdd
        };
      } else { //if specVersion wasn't added then create it with new types
        currentTypes["versioning"].push(
          {
            runtime_range: [specVersion, null],
            types: newTypesToAdd
          }
        )
      }
    }
    return currentTypes;
  }
}

function buildTop(inputContent: object, addCustom: boolean) {
  let builder = {};
  if (addCustom) {
    builder = {
      String: "Text",
      FixedU128: "u128",
      U256: "u256",
      SessionKeys2: "(AccountId, AccountId)"
    };
  }

  buildTypes(builder, inputContent);
  return builder;
}

function buildTypes(builder: any, tree: object) {
  for (let [key, value] of Object.entries(tree)) {
    if (typeof value != 'object') {
      builder[key] = value;
    } else {
      if (value["_enum"]) {
        let el = value["_enum"]
        if (Array.isArray(el)) {
          builder[key] = buildEnumItem(el);
        } else {
          builder[key] = buildEnumMapItem(el);
        }
      } else {
        builder[key] = buildStruct(value);
      }
    }
  }
}

function buildEnumItem(a: object) {
  const builder = {};
  builder["type"] = "enum";
  builder["values_list"] = [];
  for (let [, value] of Object.entries(a)) {
    builder["values_list"].push(value);
  }
  return builder;
}

function buildStruct(tree: object) {
  const builder = {};
  builder["type"] = "struct";
  builder["type_mapping"] = [];
  for (let [key, value] of Object.entries(tree)) {
    builder["type_mapping"].push(buildArrayItem(key, value));
  }
  return builder;
}

function buildArrayItem(key: string, value: any) {
  return [key, value];
}

function buildEnumMapItem(o: object) {
  const builder = {};
  builder["type"] =  "enum";
  builder["type_mapping"] = [];
  for (let [key, value] of Object.entries(o)) {
    builder["type_mapping"].push(buildArrayItem(key, value));
  }
  return builder;
}
