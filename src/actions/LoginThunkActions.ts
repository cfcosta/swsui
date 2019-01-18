import moment from 'moment';
import { ThunkDispatch } from 'redux-thunk';
import { HTTP_CODES } from '../types/Common';
import { KialiAppState, LoginState, LoginSession } from '../store/Store';
import { KialiAppAction } from './KialiAppAction';
import HelpDropdownThunkActions from './HelpDropdownThunkActions';
import GrafanaThunkActions from './GrafanaThunkActions';
import { LoginActions } from './LoginActions';
import * as API from '../services/Api';
import { ServerConfigActions } from './ServerConfigActions';

import * as Login from '../services/Login';
import { AuthResult } from '../types/Auth';

type KialiDispatch = ThunkDispatch<KialiAppState, void, KialiAppAction>;

const Dispatcher = new Login.LoginDispatcher();

const shouldRelogin = (state?: LoginState): boolean =>
  !state || !state.session || moment(state.session!.expiresOn).diff(moment()) > 0;

const loginSuccess = async (dispatch: KialiDispatch, session: LoginSession) => {
  const authHeader = `Bearer ${session.token}`;

  try {
    dispatch(LoginActions.loginSuccess(session));

    dispatch(HelpDropdownThunkActions.refresh());
    dispatch(GrafanaThunkActions.getInfo(authHeader));

    const response = await API.getServerConfig(authHeader);

    dispatch(ServerConfigActions.setServerConfig(response.data));
  } catch (error) {
    if (error.response && error.response.status === HTTP_CODES.UNAUTHORIZED) {
      dispatch(LoginActions.logoutSuccess());
    }
  }
};

// Performs the user login, dispatching to the proper login implementations.
// The `data` argument is defined as `any` because the dispatchers receive
// different kinds of data (such as e-mail/password, tokens).
const performLogin = (dispatch: KialiDispatch, state: KialiAppState, data?: any) => {
  const bail = (error: Login.LoginResult) =>
    data ? dispatch(LoginActions.loginFailure(error)) : dispatch(LoginActions.logoutSuccess());

  Dispatcher.prepare().then((result: AuthResult) => {
    if (result === AuthResult.CONTINUE) {
      Dispatcher.perform({ dispatch, state, data }).then(
        loginResult => loginSuccess(dispatch, loginResult.session!),
        error => bail(error)
      );
    } else {
      bail({ status: AuthResult.FAILURE, error: 'Preparation for login failed, try again.' });
    }
  });
};

const LoginThunkActions = {
  extendSession: () => {
    return (dispatch: KialiDispatch, getState: () => KialiAppState) => {
      const session = getState().authentication!.session!;
      dispatch(LoginActions.loginExtend(session));
    };
  },
  checkCredentials: () => {
    return (dispatch: KialiDispatch, getState: () => KialiAppState) => {
      const state: KialiAppState = getState();

      dispatch(LoginActions.loginRequest());

      if (shouldRelogin(state.authentication)) {
        performLogin(dispatch, state);
      } else {
        loginSuccess(dispatch, state.authentication!.session!);
      }
    };
  },
  // action creator that performs the async request
  authenticate: (username: string, password: string) => {
    return (dispatch: KialiDispatch, getState: () => KialiAppState) =>
      performLogin(dispatch, getState(), { username, password });
  }
};

export default LoginThunkActions;
