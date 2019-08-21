import { distinctUntilChanged, filter, map, switchMap, take } from 'rxjs/operators';
import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { isNotEmpty } from '../../shared/empty.util';
import { BrowseService } from '../browse/browse.service';
import { RemoteDataBuildService } from '../cache/builders/remote-data-build.service';
import { CoreState } from '../core.reducers';
import { Item } from '../shared/item.model';
import { URLCombiner } from '../url-combiner/url-combiner';

import { DataService } from './data.service';
import { RequestService } from './request.service';
import { HALEndpointService } from '../shared/hal-endpoint.service';
import { FindAllOptions, GetRequest, PatchRequest, RestRequest } from './request.models';
import { ObjectCacheService } from '../cache/object-cache.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import { DSOChangeAnalyzer } from './dso-change-analyzer.service';
import { HttpClient } from '@angular/common/http';
import { NormalizedObjectBuildService } from '../cache/builders/normalized-object-build.service';
import { configureRequest, getRequestFromRequestHref } from '../shared/operators';
import { RequestEntry } from './request.reducer';
import { PaginatedSearchOptions } from '../../+search-page/paginated-search-options.model';
import { RemoteData } from './remote-data';
import { PaginatedList } from './paginated-list';
import { Bitstream } from '../shared/bitstream.model';

@Injectable()
export class ItemDataService extends DataService<Item> {
  protected linkPath = 'items';
  protected forceBypassCache = false;

  constructor(
    protected requestService: RequestService,
    protected rdbService: RemoteDataBuildService,
    protected dataBuildService: NormalizedObjectBuildService,
    protected store: Store<CoreState>,
    private bs: BrowseService,
    protected objectCache: ObjectCacheService,
    protected halService: HALEndpointService,
    protected notificationsService: NotificationsService,
    protected http: HttpClient,
    protected comparator: DSOChangeAnalyzer<Item>) {
    super();
  }

  /**
   * Get the endpoint for browsing items
   *  (When options.sort.field is empty, the default field to browse by will be 'dc.date.issued')
   * @param {FindAllOptions} options
   * @returns {Observable<string>}
   */
  public getBrowseEndpoint(options: FindAllOptions = {}, linkPath: string = this.linkPath): Observable<string> {
    let field = 'dc.date.issued';
    if (options.sort && options.sort.field) {
      field = options.sort.field;
    }
    return this.bs.getBrowseURLFor(field, linkPath).pipe(
      filter((href: string) => isNotEmpty(href)),
      map((href: string) => new URLCombiner(href, `?scope=${options.scopeID}`).toString()),
      distinctUntilChanged(),);
  }

  /**
   * Get the endpoint for item withdrawal and reinstatement
   * @param itemId
   */
  public getItemWithdrawEndpoint(itemId: string): Observable<string> {
    return this.halService.getEndpoint(this.linkPath).pipe(
      map((endpoint: string) => this.getIDHref(endpoint, itemId))
    );
  }

  /**
   * Get the endpoint to make item private and public
   * @param itemId
   */
  public getItemDiscoverableEndpoint(itemId: string): Observable<string> {
    return this.halService.getEndpoint(this.linkPath).pipe(
      map((endpoint: string) => this.getIDHref(endpoint, itemId))
    );
  }

  /**
   * Set the isWithdrawn state of an item to a specified state
   * @param itemId
   * @param withdrawn
   */
  public setWithDrawn(itemId: string, withdrawn: boolean) {
    const patchOperation = [{
      op: 'replace', path: '/withdrawn', value: withdrawn
    }];
    return this.getItemWithdrawEndpoint(itemId).pipe(
      distinctUntilChanged(),
      map((endpointURL: string) =>
        new PatchRequest(this.requestService.generateRequestId(), endpointURL, patchOperation)
      ),
      configureRequest(this.requestService),
      map((request: RestRequest) => request.href),
      getRequestFromRequestHref(this.requestService),
      map((requestEntry: RequestEntry) => requestEntry.response)
    );
  }

  /**
   * Set the isDiscoverable state of an item to a specified state
   * @param itemId
   * @param discoverable
   */
  public setDiscoverable(itemId: string, discoverable: boolean) {
    const patchOperation = [{
      op: 'replace', path: '/discoverable', value: discoverable
    }];
    return this.getItemDiscoverableEndpoint(itemId).pipe(
      distinctUntilChanged(),
      map((endpointURL: string) =>
        new PatchRequest(this.requestService.generateRequestId(), endpointURL, patchOperation)
      ),
      configureRequest(this.requestService),
      map((request: RestRequest) => request.href),
      getRequestFromRequestHref(this.requestService),
      map((requestEntry: RequestEntry) => requestEntry.response)
    );
  }

  /**
   * Get the endpoint for an item's bitstreams
   * @param itemId
   */
  public getBitstreamsEndpoint(itemId: string): Observable<string> {
    return this.halService.getEndpoint(this.linkPath).pipe(
      switchMap((url: string) => this.halService.getEndpoint('bitstreams', `${url}/${itemId}`))
    );
  }

  /**
   * Get an item's bitstreams using paginated search options
   * @param itemId          The item's ID
   * @param searchOptions   The search options to use
   */
  public getBitstreams(itemId: string, searchOptions?: PaginatedSearchOptions): Observable<RemoteData<PaginatedList<Bitstream>>> {
    const hrefObs = this.getItemWithdrawEndpoint(itemId).pipe(
      map((href) => `${href}/bitstreams`),
      map((href) => searchOptions ? searchOptions.toRestUrl(href) : href)
    );
    hrefObs.pipe(
      take(1)
    ).subscribe((href) => {
      const request = new GetRequest(this.requestService.generateRequestId(), href);
      this.requestService.configure(request);
    });

    return this.rdbService.buildList<Bitstream>(hrefObs);
  }

}
