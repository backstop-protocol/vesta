import React, { Component } from "react";
import {observer} from "mobx-react"
import styled from "styled-components"
import {device} from "../screenSizes";
import routerStore from "../stores/router.store"
import SpActionBox from "../components/stability-pool/SpActionBox"
import Navbar from "../components/stability-pool/Navbar"
import vestaStore from "../stores/vesta.store"
import VestaInfoPage from "../components/vesta/VestaInfoPage"
import userStore from "../stores/user.store"

class Vesta extends Component {

  constructor(props) {
    super(props);
  }

  componentDidMount() {
    routerStore.setRouteProps(this.props.history) 
  }

  render() {
    const stabilityPools = [
      {
        asset: 'USDC',
        amount: '1000.43',
        apy: '5.4',
        walletBalance: '5000000.12'
      },
      {
        asset: 'USDT',
        amount: '404.21',
        apy: '6.7',
        walletBalance: '5000.12'
      },

    ]
    const hideInfoPage = userStore.loggedIn || userStore.connecting
    return (
      <div className="content">
        {hideInfoPage && <div>
          <Navbar/>
          <div className="container" >
            {vestaStore.loading && <div className="fade-in" style={{marginTop: '200px', textAlign: 'center'}} aria-busy={vestaStore.loading}>
              loading...
            </div>}
            {vestaStore.stabilityPools.map((sp, i)=> <SpActionBox key={i} store={sp}/>)}
          </div>
        </div>}
        {!hideInfoPage && <VestaInfoPage/>}
      </div>
    );
  }
}

export default observer(Vesta)